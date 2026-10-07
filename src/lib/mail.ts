import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {PATHS} from './paths.js'

export const MAIL_STORE = PATHS.icloudMail
export const SIGNATURES_DIR = path.join(MAIL_STORE, 'signatures')
export const ACCOUNTS_FILE = path.join(MAIL_STORE, 'accounts.json')
export const RULES_FILE = path.join(MAIL_STORE, 'rules.json')

export interface MailAccount {
  emails: string[]
  name: string
  port: null | number
  server: null | string
  /** Mail's own classification: "iCloud", "imap", "pop", "unknown" (Exchange) */
  type: string
  user: string
}

export interface RuleCondition {
  expression: string
  qualifier: string
  ruleType: string
}

export interface MailRule {
  /** Mail's "all conditions must be met" toggle */
  allConditions: boolean
  conditions: RuleCondition[]
  enabled: boolean
  /** Mailbox name for a move action, if the rule has one */
  moveTo: null | string
  name: string
}

export interface MailSignature {
  content: string
  name: string
}

export interface MailExport {
  accounts: MailAccount[]
  exportedAt: string
  rules: MailRule[]
  signatures: MailSignature[]
}

/**
 * Escape a value for embedding in an AppleScript string literal.
 *
 * Restore generates AppleScript containing signature bodies and rule
 * expressions, so anything with a quote or backslash would otherwise end the
 * literal early and produce a syntax error - or, with hostile input, run as
 * code. AppleScript has no escape for a raw newline inside a literal, so those
 * are rebuilt by concatenating `linefeed`.
 */
export function asLiteral(value: string): string {
  const escaped = value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)
  const lines = escaped.split(/\r?\n/)
  if (lines.length === 1) return `"${lines[0]}"`
  return lines.map((l) => `"${l}"`).join(' & linefeed & ')
}

/**
 * Run an AppleScript and return stdout, or throw with Mail's own message.
 *
 * `raw` keeps the output byte-exact apart from the single newline osascript
 * appends. Trimming is fine for structured output, but a signature legitimately
 * ends in blank lines - they are the spacing above quoted text - and trimming
 * silently altered the signature on round-trip.
 */
export function osascript(script: string, {raw = false} = {}): string {
  try {
    const out = execFileSync('osascript', ['-'], {
      encoding: 'utf8',
      input: script,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return raw ? out.replace(/\n$/, '') : out.trim()
  } catch (error: unknown) {
    const {stderr} = (error as {stderr?: Buffer | string})
    const message = (stderr ? String(stderr) : (error as Error).message).trim()
    throw new Error(message || 'osascript failed')
  }
}

export function mailInstalled(): boolean {
  return fs.existsSync('/System/Applications/Mail.app') || fs.existsSync('/Applications/Mail.app')
}

/**
 * Field separator for AppleScript output.
 *
 * Mail data is free text - account names, rule expressions - so a separator
 * has to be something a user would never type. Unit Separator is the control
 * character the ASCII standard reserves for exactly this.
 */
const SEP = String.fromCodePoint(31)
const ROW = String.fromCodePoint(30)

function splitRows(raw: string): string[][] {
  return raw
    .split(ROW)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => r.split(SEP))
}

const SEP_AS = `(ASCII character 31)`
const ROW_AS = `(ASCII character 30)`

export function readAccounts(): MailAccount[] {
  const raw = osascript(`
tell application "Mail"
  set AppleScript's text item delimiters to ", "
  set out to ""
  repeat with a in every account
    set em to ""
    try
      set em to (email addresses of a) as text
    end try
    set sv to ""
    try
      set sv to (server name of a) as text
    end try
    set pt to ""
    try
      set pt to (port of a) as text
    end try
    set out to out & (name of a) & ${SEP_AS} & (account type of a as string) & ${SEP_AS} & (user name of a) & ${SEP_AS} & em & ${SEP_AS} & sv & ${SEP_AS} & pt & ${ROW_AS}
  end repeat
  set AppleScript's text item delimiters to ""
  return out
end tell`)

  return splitRows(raw).map(([name, type, user, emails, server, port]) => ({
    emails: (emails ?? '')
      .split(', ')
      .map((e) => e.trim())
      .filter(Boolean),
    name: name ?? '',
    // Mail reports "missing value" and port 0 for accounts it configures
    // itself, such as Exchange over OAuth.
    port: port && port !== '0' ? Number(port) : null,
    server: server && server !== 'missing value' ? server : null,
    type: type ?? 'unknown',
    user: user ?? '',
  }))
}

export function readSignatures(): MailSignature[] {
  const names = splitRows(
    osascript(`
tell application "Mail"
  set out to ""
  repeat with s in every signature
    set out to out & (name of s) & ${ROW_AS}
  end repeat
  return out
end tell`),
  ).map((r) => r[0])

  return names.map((name) => ({
    content: osascript(
      `
tell application "Mail"
  return (content of signature ${asLiteral(name)}) as text
end tell`,
      {raw: true},
    ),
    name,
  }))
}

export function readRules(): MailRule[] {
  const raw = osascript(`
tell application "Mail"
  set out to ""
  repeat with r in every rule
    set mb to ""
    try
      set mb to name of (mailbox of r)
    end try
    set out to out & (name of r) & ${SEP_AS} & (enabled of r as string) & ${SEP_AS} & (all conditions must be met of r as string) & ${SEP_AS} & mb
    repeat with c in rule conditions of r
      set out to out & ${SEP_AS} & (rule type of c as string) & ${SEP_AS} & (qualifier of c as string) & ${SEP_AS} & (expression of c)
    end repeat
    set out to out & ${ROW_AS}
  end repeat
  return out
end tell`)

  return splitRows(raw).map((cells) => {
    const [name, enabled, allConditions, moveTo, ...rest] = cells
    const conditions: RuleCondition[] = []
    for (let i = 0; i + 2 < rest.length + 1; i += 3) {
      if (rest[i] === undefined) break
      conditions.push({expression: rest[i + 2] ?? '', qualifier: rest[i + 1] ?? '', ruleType: rest[i]})
    }

    return {
      allConditions: allConditions === 'true',
      conditions,
      enabled: enabled === 'true',
      moveTo: moveTo || null,
      name: name ?? '',
    }
  })
}

/**
 * Build the AppleScript that recreates one signature.
 *
 * Mail appends a single trailing space to the content when it creates a
 * signature. Verified by round-tripping: the recreated body is byte-identical
 * to the stored one apart from that space, so it is Mail's normalisation and
 * not a loss of data. Nothing here tries to compensate for it - that would
 * mean storing something different from what Mail actually holds.
 */
export function signatureScript(sig: MailSignature): string {
  return `
tell application "Mail"
  if not (exists signature ${asLiteral(sig.name)}) then
    make new signature with properties {name:${asLiteral(sig.name)}, content:${asLiteral(sig.content)}}
  end if
end tell`
}

/** Build the AppleScript that recreates one rule and its conditions. */
export function ruleScript(rule: MailRule): string {
  const conditions = rule.conditions
    .map(
      (c) =>
        `  make new rule condition at end of rule conditions of r with properties {rule type:${c.ruleType}, qualifier:${c.qualifier}, expression:${asLiteral(c.expression)}}`,
    )
    .join('\n')

  return `
tell application "Mail"
  if not (exists rule ${asLiteral(rule.name)}) then
    set r to make new rule with properties {name:${asLiteral(rule.name)}, enabled:${rule.enabled}, all conditions must be met:${rule.allConditions}}
${conditions}
  end if
end tell`
}

export function writeExport(data: MailExport): void {
  fs.mkdirSync(SIGNATURES_DIR, {recursive: true})
  fs.writeFileSync(ACCOUNTS_FILE, `${JSON.stringify({accounts: data.accounts, exportedAt: data.exportedAt}, null, 2)}\n`, 'utf8')
  fs.writeFileSync(RULES_FILE, `${JSON.stringify(data.rules, null, 2)}\n`, 'utf8')

  // One file per signature: the content is multi-line rich text and round-trips
  // more faithfully as a file than embedded in JSON.
  for (const sig of data.signatures) {
    fs.writeFileSync(path.join(SIGNATURES_DIR, `${sig.name.replaceAll('/', '-')}.txt`), sig.content, 'utf8')
  }
}

export function readExport(): MailExport | null {
  if (!fs.existsSync(ACCOUNTS_FILE)) return null

  const accountsFile = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')) as {
    accounts: MailAccount[]
    exportedAt: string
  }
  const rules = fs.existsSync(RULES_FILE) ? (JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')) as MailRule[]) : []

  const signatures: MailSignature[] = []
  if (fs.existsSync(SIGNATURES_DIR)) {
    for (const file of fs.readdirSync(SIGNATURES_DIR)) {
      if (!file.endsWith('.txt')) continue
      signatures.push({
        content: fs.readFileSync(path.join(SIGNATURES_DIR, file), 'utf8'),
        name: file.replace(/\.txt$/, ''),
      })
    }
  }

  return {accounts: accountsFile.accounts, exportedAt: accountsFile.exportedAt, rules, signatures}
}

/** How an account has to be re-added. None of these can be scripted. */
export function howToAdd(account: MailAccount): string {
  switch (account.type) {
    case 'iCloud': {
      return 'System Settings → Apple Account → sign in, then enable Mail'
    }

    case 'imap':
    case 'pop': {
      return account.server
        ? `Mail → Add Account (${account.server}:${account.port ?? '?'})`
        : 'Mail → Add Account'
    }

    default: {
      return 'Mail → Add Account → Microsoft Exchange (OAuth sign-in)'
    }
  }
}
