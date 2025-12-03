import {z} from 'zod'

export const OrganizationSchema = z.object({
  folderName: z.string(),
  gitEmail: z.string().email(),
  gitUsername: z.string(),
  name: z.string(),
  signingKey: z.string().optional(),
})

export const DevSlothConfigSchema = z.object({
  defaultOrganization: z.string().optional(),
  organizations: z.array(OrganizationSchema),
  paths: z.object({
    githubRoot: z.string(),
  }),
  sshSigning: z.object({
    defaultKeyPath: z.string(),
    enabled: z.boolean(),
  }),
  syncedFiles: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
    }),
  ),
  version: z.literal(1),
})

export type Organization = z.infer<typeof OrganizationSchema>
export type DevSlothConfig = z.infer<typeof DevSlothConfigSchema>

export interface SecretEntry {
  name: string
  value: string
}

export interface SymlinkStatus {
  error?: string
  exists: boolean
  isValid: boolean
  source: string
  target: string
}

export interface DaemonState {
  intervalMs: number
  lastSyncTime: null | string
  pid: null | number
  running: boolean
  startedAt: null | string
}

export const DEFAULT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
