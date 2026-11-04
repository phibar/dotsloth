/*
 * Purpose: Sync ~/github/topics/<topic>/<repo> symlinks from GitHub repo topics.
 * Intention: uses gh CLI, isRepo from repo-audit, readConfig from config, runAsync from exec.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import {readConfig} from './config.js'
import {runAsync} from './exec.js'
import {isRepo} from './repo-audit.js'
import type {SyncStep} from './sync.js'

export interface TopicsResult {
  ok: boolean
  steps: SyncStep[]
  warnings: string[]
}

export interface TopicsOptions {
  dryRun?: boolean
  offline?: boolean
}

interface TopicSyncContext {
  dryRun: boolean
  topicMap: Map<string, string[]>
  topicsRoot: string
}

interface GhRepo {
  name: string
  repositoryTopics: Array<{name: string}> | null
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchOrgTopics(org: string, githubRoot: string): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  let raw: string
  try {
    raw = await runAsync('gh', ['repo', 'list', org, '--json', 'name,repositoryTopics', '--limit', '1000'])
  } catch {
    return result
  }

  let repos: GhRepo[]
  try {
    repos = JSON.parse(raw) as GhRepo[]
  } catch {
    return result
  }

  for (const repo of repos) {
    const repoPath = path.join(githubRoot, org, repo.name)
    if (!isRepo(repoPath)) continue
    const topics = (repo.repositoryTopics ?? []).map((t) => t.name).filter(Boolean)
    if (topics.length > 0) result.set(repoPath, topics)
  }

  return result
}

export function buildTopicMap(repoTopics: Map<string, string[]>): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const [repoPath, topics] of repoTopics) {
    for (const topic of topics) {
      const repos = result.get(topic) ?? []
      repos.push(repoPath)
      result.set(topic, repos)
    }
  }

  return result
}

function pickSymlinkName(repoPath: string, taken: Set<string>): string {
  const name = path.basename(repoPath)
  if (!taken.has(name)) return name
  const org = path.basename(path.dirname(repoPath))
  return `${org}-${name}`
}

export function syncTopicSymlinks({topicsRoot, topicMap, dryRun}: TopicSyncContext): SyncStep[] {
  const steps: SyncStep[] = []

  for (const [topic, repoPaths] of topicMap) {
    const topicDir = path.join(topicsRoot, topic)
    if (!dryRun) fs.mkdirSync(topicDir, {recursive: true})

    const taken = new Set<string>()
    for (const repoPath of repoPaths) {
      const name = pickSymlinkName(repoPath, taken)
      taken.add(name)
      const linkPath = path.join(topicDir, name)
      const target = path.relative(topicDir, repoPath)

      if (dryRun) {
        steps.push({detail: target, label: `${topic}/${name}`, ok: true})
        continue
      }

      try {
        if (fs.readlinkSync(linkPath) === target) continue
        fs.unlinkSync(linkPath)
      } catch {
        // No existing symlink — create it.
      }

      try {
        fs.symlinkSync(target, linkPath)
        steps.push({label: `${topic}/${name}`, ok: true})
      } catch (error) {
        steps.push({detail: errorDetail(error), label: `${topic}/${name}`, ok: false})
      }
    }
  }

  return steps
}

function pruneTopicDir(topicDir: string, topic: string, validTargets: Set<string>, dryRun: boolean): SyncStep[] {
  const steps: SyncStep[] = []
  let links: fs.Dirent[]
  try {
    links = fs.readdirSync(topicDir, {withFileTypes: true})
  } catch {
    return steps
  }

  for (const link of links) {
    if (!link.isSymbolicLink()) continue
    let target: string
    try {
      target = fs.readlinkSync(path.join(topicDir, link.name))
    } catch {
      continue
    }

    if (validTargets.has(target)) continue

    if (dryRun) {
      steps.push({label: `remove ${topic}/${link.name}`, ok: true})
      continue
    }

    try {
      fs.unlinkSync(path.join(topicDir, link.name))
      steps.push({label: `removed ${topic}/${link.name}`, ok: true})
    } catch (error) {
      steps.push({detail: errorDetail(error), label: `remove ${topic}/${link.name}`, ok: false})
    }
  }

  return steps
}

export function pruneTopicSymlinks({topicsRoot, topicMap, dryRun}: TopicSyncContext): SyncStep[] {
  const steps: SyncStep[] = []
  if (!fs.existsSync(topicsRoot)) return steps

  let topicDirs: fs.Dirent[]
  try {
    topicDirs = fs.readdirSync(topicsRoot, {withFileTypes: true})
  } catch {
    return steps
  }

  for (const entry of topicDirs) {
    if (!entry.isDirectory()) continue
    const topicDir = path.join(topicsRoot, entry.name)
    const validTargets = new Set((topicMap.get(entry.name) ?? []).map((rp) => path.relative(topicDir, rp)))
    const removed = pruneTopicDir(topicDir, entry.name, validTargets, dryRun)
    steps.push(...removed)

    if (!dryRun && removed.some((s) => s.label.startsWith('removed'))) {
      try {
        if (fs.readdirSync(topicDir).length === 0) fs.rmdirSync(topicDir)
      } catch {
        // Not empty or already gone.
      }
    }
  }

  return steps
}

export async function runTopicsSync(options: TopicsOptions = {}): Promise<TopicsResult> {
  const {dryRun = false, offline = false} = options
  const steps: SyncStep[] = []
  const warnings: string[] = []

  const config = readConfig()
  if (!config) {
    return {
      ok: false,
      steps: [{label: 'No configuration found — run "dotsloth init" first', ok: false}],
      warnings,
    }
  }

  const topicsRoot = path.join(config.paths.githubRoot, 'topics')
  const allRepoTopics = new Map<string, string[]>()

  if (!offline) {
    for (const org of config.organizations) {
      // biome-ignore lint/performance/noAwaitInLoops: one org at a time to avoid bursting gh API
      const orgTopics = await fetchOrgTopics(org.name, config.paths.githubRoot)
      for (const [repoPath, topics] of orgTopics) {
        allRepoTopics.set(repoPath, topics)
      }

      if (orgTopics.size === 0) warnings.push(`No locally cloned repos with topics found for "${org.name}"`)
    }
  }

  const topicMap = buildTopicMap(allRepoTopics)
  const context: TopicSyncContext = {dryRun, topicMap, topicsRoot}

  steps.push(...pruneTopicSymlinks(context))
  steps.push(...syncTopicSymlinks(context))

  return {ok: steps.every((s) => s.ok), steps, warnings}
}
