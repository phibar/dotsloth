import * as os from 'node:os'
import * as path from 'node:path'

const home = os.homedir()

export const PATHS = {
  defaultSshKey: path.join(home, '.ssh/id_ed25519'),

  defaultSshPubKey: path.join(home, '.ssh/id_ed25519.pub'),
  // Dotfile targets
  gitconfig: path.join(home, '.gitconfig'),
  githubRoot: path.join(home, 'github'),
  home,
  icloudAllowedSigners: path.join(
    home,
    'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/allowed_signers',
  ),
  icloudConfig: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/config.json'),

  icloudDotfiles: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/dotfiles'),
  icloudDotsloth: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth'),
  // iCloud paths
  icloudDrive: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs'),

  icloudOrganizations: path.join(
    home,
    'Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/organizations',
  ),
  // Local paths
  localConfig: path.join(home, '.config/dotsloth'),
  localState: path.join(home, '.config/dotsloth/state.json'),

  sshConfig: path.join(home, '.ssh/config'),
  // SSH
  sshDir: path.join(home, '.ssh'),
  zprofile: path.join(home, '.zprofile'),
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
