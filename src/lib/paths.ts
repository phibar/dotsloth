import * as os from 'node:os'
import * as path from 'node:path'

const home = os.homedir()

export const PATHS = {
  home,

  // iCloud paths
  icloudDrive: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs'),
  icloudDotsloth: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth'),
  icloudConfig: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/config.json'),
  icloudDotfiles: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/dotfiles'),
  icloudOrganizations: path.join(
    home,
    'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/organizations',
  ),
  icloudAllowedSigners: path.join(
    home,
    'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/allowed_signers',
  ),
  icloudEnvFiles: path.join(
    home,
    'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/envfiles',
  ),

  // Local paths
  localConfig: path.join(home, '.config/dotsloth'),
  localState: path.join(home, '.config/dotsloth/state.json'),
  githubRoot: path.join(home, 'github'),

  // Dotfile targets
  gitconfig: path.join(home, '.gitconfig'),
  zprofile: path.join(home, '.zprofile'),
  sshConfig: path.join(home, '.ssh/config'),

  // SSH
  sshDir: path.join(home, '.ssh'),
  defaultSshKey: path.join(home, '.ssh/id_ed25519'),
  defaultSshPubKey: path.join(home, '.ssh/id_ed25519.pub'),
} as const

export function getOrgGitconfigPath(orgName: string): string {
  return path.join(PATHS.icloudOrganizations, `${orgName.toLowerCase()}.gitconfig`)
}

export function getOrgRepoPath(orgName: string): string {
  return path.join(PATHS.githubRoot, orgName)
}

export function getIcloudDotfilePath(filename: string): string {
  return path.join(PATHS.icloudDotfiles, filename)
}

/**
 * Get the iCloud path for a project's env file.
 * The path mirrors the project's relative location from the github root.
 * @param projectRelativePath - The project path relative to the github root (e.g., "my-org/my-repo")
 * @param envFileName - The name of the env file (e.g., ".env", ".env.local")
 */
export function getEnvFilePath(projectRelativePath: string, envFileName: string): string {
  return path.join(PATHS.icloudEnvFiles, projectRelativePath, envFileName)
}
