import {z} from 'zod'

export const OrganizationSchema = z.object({
  name: z.string(),
  folderName: z.string(),
  gitEmail: z.string().email(),
  gitUsername: z.string(),
  signingKey: z.string().optional(),
})

export const DevSlothConfigSchema = z.object({
  version: z.literal(1),
  defaultOrganization: z.string().optional(),
  organizations: z.array(OrganizationSchema),
  sshSigning: z.object({
    enabled: z.boolean(),
    defaultKeyPath: z.string(),
  }),
  paths: z.object({
    githubRoot: z.string(),
  }),
  syncedFiles: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
    }),
  ),
})

export type Organization = z.infer<typeof OrganizationSchema>
export type DevSlothConfig = z.infer<typeof DevSlothConfigSchema>

export interface SecretEntry {
  name: string
  value: string
}

export interface SymlinkStatus {
  source: string
  target: string
  exists: boolean
  isValid: boolean
  error?: string
}
