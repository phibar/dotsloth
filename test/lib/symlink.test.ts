import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {checkSymlink, createSymlink, removeSymlink} from '../../src/lib/symlink.js'

/**
 * symlink.ts is the module where a bug silently destroys dotfiles, so these
 * tests focus on the destructive paths rather than the happy one.
 */
describe('symlink', () => {
  let dir: string
  let source: string
  let target: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-symlink-'))
    source = path.join(dir, 'source.txt')
    target = path.join(dir, 'target.txt')
    fs.writeFileSync(source, 'from-store', 'utf8')
  })

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true})
  })

  it('links target to source', async () => {
    const result = await createSymlink({source, target})
    expect(result.isValid).to.equal(true)
    expect(fs.readFileSync(target, 'utf8')).to.equal('from-store')
    expect(fs.lstatSync(target).isSymbolicLink()).to.equal(true)
  })

  it('refuses to link when the source is missing', async () => {
    const result = await createSymlink({source: path.join(dir, 'nope.txt'), target})
    expect(result.isValid).to.equal(false)
    expect(fs.existsSync(target)).to.equal(false)
  })

  it('backs up an existing real file instead of destroying it', async () => {
    fs.writeFileSync(target, 'precious-local-data', 'utf8')

    const result = await createSymlink({backup: true, source, target})
    expect(result.isValid).to.equal(true)

    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('target.txt.backup.'))
    expect(backups, 'a backup should have been written').to.have.lengthOf(1)
    expect(fs.readFileSync(path.join(dir, backups[0]), 'utf8')).to.equal('precious-local-data')
  })

  it('destroys an existing file when backup is disabled', async () => {
    fs.writeFileSync(target, 'precious-local-data', 'utf8')

    await createSymlink({backup: false, source, target})
    expect(fs.readdirSync(dir).filter((f) => f.includes('.backup.'))).to.have.lengthOf(0)
    expect(fs.readFileSync(target, 'utf8')).to.equal('from-store')
  })

  it('is idempotent and does not pile up backups', async () => {
    await createSymlink({source, target})
    await createSymlink({source, target})
    await createSymlink({source, target})

    expect(fs.readdirSync(dir).filter((f) => f.includes('.backup.'))).to.have.lengthOf(0)
  })

  it('replaces a symlink that points somewhere else', async () => {
    const wrong = path.join(dir, 'wrong.txt')
    fs.writeFileSync(wrong, 'wrong', 'utf8')
    fs.symlinkSync(wrong, target)

    const result = await createSymlink({source, target})
    expect(result.isValid).to.equal(true)
    expect(fs.readlinkSync(target)).to.equal(source)
  })

  it('creates missing parent directories', async () => {
    const nested = path.join(dir, 'a', 'b', 'c.txt')
    const result = await createSymlink({source, target: nested})
    expect(result.isValid).to.equal(true)
    expect(fs.readFileSync(nested, 'utf8')).to.equal('from-store')
  })

  describe('checkSymlink', () => {
    it('reports a missing link', () => {
      expect(checkSymlink(source, target).exists).to.equal(false)
    })

    it('reports a real file as not a symlink', () => {
      fs.writeFileSync(target, 'x', 'utf8')
      const status = checkSymlink(source, target)
      expect(status.exists).to.equal(true)
      expect(status.isValid).to.equal(false)
    })

    it('reports a link to the wrong source', () => {
      fs.symlinkSync(path.join(dir, 'other'), target)
      expect(checkSymlink(source, target).isValid).to.equal(false)
    })
  })

  describe('removeSymlink', () => {
    it('removes a symlink', async () => {
      await createSymlink({source, target})
      expect(removeSymlink(target)).to.equal(true)
      expect(fs.existsSync(target)).to.equal(false)
    })

    it('refuses to remove a real file', () => {
      fs.writeFileSync(target, 'real', 'utf8')
      expect(removeSymlink(target)).to.equal(false)
      expect(fs.existsSync(target)).to.equal(true)
    })
  })
})
