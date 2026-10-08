import type {MailAccount, MailExport, MailRule, MailSignature} from '../lib/mail.js'
import {
  howToAdd,
  MAIL_STORE,
  mailInstalled,
  osascript,
  readAccounts,
  readExport,
  readRules,
  readSignatures,
  ruleScript,
  signatureScript,
  writeExport,
} from '../lib/mail.js'
import {CoreError} from './errors.js'
import type {OnEvent} from './events.js'
import {ignoreEvents} from './events.js'

/**
 * Mail's own data lives under ~/Library/Mail and ~/Library/Accounts, both
 * TCC-protected. Everything here goes through Mail's scripting interface
 * (osascript), which is slow and needs Automation permission: macOS asks
 * once, the first time.
 */

export interface MailCounts {
  accounts: number
  rules: number
  signatures: number
}

export interface MailStatus {
  /** Null until something has been exported. */
  exported: null | {counts: MailCounts; exportedAt: string}
  installed: boolean
  /** What Mail on this machine has; null when Mail is not installed or nothing is exported. */
  local: MailCounts | null
  /** Accounts in the store that are not configured here. */
  missingAccounts: MailAccount[]
  store: string
}

const countsOf = (data: Pick<MailExport, 'accounts' | 'rules' | 'signatures'>): MailCounts => ({
  accounts: data.accounts.length,
  rules: data.rules.length,
  signatures: data.signatures.length,
})

export function getMailStatus(): MailStatus {
  const stored = readExport()
  const installed = mailInstalled()
  const base = {installed, store: MAIL_STORE}
  if (!stored) return {...base, exported: null, local: null, missingAccounts: []}

  const exported = {counts: countsOf(stored), exportedAt: stored.exportedAt}
  if (!installed) return {...base, exported, local: null, missingAccounts: []}

  const live = {accounts: readAccounts(), rules: readRules(), signatures: readSignatures()}
  const missingAccounts = stored.accounts.filter((a) => !live.accounts.some((l) => l.name === a.name))
  return {...base, exported, local: countsOf(live), missingAccounts}
}

export type MailEvent = {label: string; type: 'phase'}

export interface MailExportResult {
  accounts: MailAccount[]
  conditionCount: number
  ruleCount: number
  signatureCount: number
  store: string
  /** False for a dry run. */
  written: boolean
}

function readFromMail<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    throw new CoreError('COMMAND_FAILED', `Could not read from Mail: ${(error as Error).message}`, [
      'If macOS asked for permission to control Mail, allow it and run this again.',
    ])
  }
}

/** Export accounts, rules and signatures from Mail to the store. */
export function exportMail({dryRun = false} = {}, onEvent: OnEvent<MailEvent> = ignoreEvents): MailExportResult {
  if (!mailInstalled()) throw new CoreError('NOT_FOUND', 'Mail.app not found on this machine.')

  onEvent({label: 'Reading accounts', type: 'phase'})
  const accounts = readFromMail(readAccounts)
  onEvent({label: 'Reading rules', type: 'phase'})
  const rules = readFromMail(readRules)
  onEvent({label: 'Reading signatures', type: 'phase'})
  const signatures = readFromMail(readSignatures)

  if (!dryRun) writeExport({accounts, exportedAt: new Date().toISOString(), rules, signatures})

  return {
    accounts,
    conditionCount: rules.reduce((n, r) => n + r.conditions.length, 0),
    ruleCount: rules.length,
    signatureCount: signatures.length,
    store: MAIL_STORE,
    written: !dryRun,
  }
}

export interface MailRestorePlan {
  /**
   * Accounts are a checklist, never automated: every account type is Apple ID
   * or OAuth backed, and macOS 26 removed `profiles install` anyway.
   */
  accounts: Array<{account: MailAccount; howToAdd: string; present: boolean}>
  exportedAt: string
  rules: Array<{
    /** blocked: moves mail to a mailbox that has to exist first. */
    action: 'blocked' | 'create' | 'present'
    conditions: number
    moveTo: null | string
    name: string
  }>
  signatures: Array<{action: 'create' | 'present'; name: string}>
}

interface FullPlan {
  plan: MailRestorePlan
  rules: Map<string, MailRule>
  signatures: Map<string, MailSignature>
}

function ruleAction(rule: MailRule, liveRules: Set<string>): MailRestorePlan['rules'][number]['action'] {
  if (liveRules.has(rule.name)) return 'present'
  // A move action points at a mailbox by name. Recreating the rule before
  // that mailbox exists would silently drop the action.
  return rule.moveTo ? 'blocked' : 'create'
}

function buildPlan(): FullPlan {
  const stored = readExport()
  if (!stored) {
    throw new CoreError('NOT_FOUND', 'Nothing in the mail store. Run "dotsloth mail export" on the old machine first.')
  }

  // Reading Mail changes nothing, so the plan is accurate in a dry run too.
  const installed = mailInstalled()
  const liveAccounts = new Set(installed ? readAccounts().map((a) => a.name) : [])
  const liveSignatures = new Set(installed ? readSignatures().map((s) => s.name) : [])
  const liveRules = new Set(installed ? readRules().map((r) => r.name) : [])

  return {
    plan: {
      accounts: stored.accounts.map((account) => ({
        account,
        howToAdd: howToAdd(account),
        present: liveAccounts.has(account.name),
      })),
      exportedAt: stored.exportedAt,
      rules: stored.rules.map((rule) => ({
        action: ruleAction(rule, liveRules),
        conditions: rule.conditions.length,
        moveTo: rule.moveTo,
        name: rule.name,
      })),
      signatures: stored.signatures.map((sig) => ({
        action: liveSignatures.has(sig.name) ? 'present' : 'create',
        name: sig.name,
      })),
    },
    rules: new Map(stored.rules.map((r) => [r.name, r])),
    signatures: new Map(stored.signatures.map((s) => [s.name, s])),
  }
}

/** What a restore would do, without changing Mail. */
export function planMailRestore(): MailRestorePlan {
  return buildPlan().plan
}

export type MailRestoreEvent = {kind: 'rule' | 'signature'; name: string; type: 'created'}

/**
 * Recreate the signatures and rules the plan marks `create`. The plan is
 * always rebuilt from the store here - never taken from the caller - so only
 * scripts generated from the exported data ever reach osascript.
 */
export function applyMailRestore(onEvent: OnEvent<MailRestoreEvent> = ignoreEvents): MailRestorePlan {
  const {plan, rules, signatures} = buildPlan()

  for (const item of plan.signatures) {
    if (item.action !== 'create') continue
    osascript(signatureScript(signatures.get(item.name) as MailSignature))
    onEvent({kind: 'signature', name: item.name, type: 'created'})
  }

  for (const item of plan.rules) {
    if (item.action !== 'create') continue
    osascript(ruleScript(rules.get(item.name) as MailRule))
    onEvent({kind: 'rule', name: item.name, type: 'created'})
  }

  return plan
}
