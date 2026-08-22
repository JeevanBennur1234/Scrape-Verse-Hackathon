import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const ZOMBIE_PATTERN = /(bdata|@brightdata)/i
const SELF_PATTERN = /(check-zombies|Get-CimInstance|ps -eo)/i

interface ZombieProcess {
  pid: string
  command: string
}

function isSelf(command: string): boolean {
  return SELF_PATTERN.test(command)
}

async function listWindows(): Promise<ZombieProcess[]> {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process | Where-Object CommandLine -match 'bdata|@brightdata' | Format-List ProcessId,CommandLine",
  ])
  const zombies: ZombieProcess[] = []
  const blocks = stdout.split(/\r?\n\r?\n/)
  for (const block of blocks) {
    const pid = block.match(/ProcessId\s*:\s*(\d+)/)?.[1]
    const command = block.match(/CommandLine\s*:\s*(.+)/)?.[1]
    if (pid && command && !isSelf(command)) {
      zombies.push({ pid, command: command.trim() })
    }
  }
  return zombies
}

async function listPosix(): Promise<ZombieProcess[]> {
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,args='], { shell: true })
  const zombies: ZombieProcess[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (!ZOMBIE_PATTERN.test(trimmed)) continue
    if (isSelf(trimmed)) continue
    if (trimmed.includes('grep')) continue
    const spaceIndex = trimmed.indexOf(' ')
    if (spaceIndex === -1) continue
    zombies.push({
      pid: trimmed.slice(0, spaceIndex),
      command: trimmed.slice(spaceIndex + 1).trim(),
    })
  }
  return zombies
}

async function main(): Promise<void> {
  console.log('[check-zombies] scanning for orphaned bdata/@brightdata processes...')
  let zombies: ZombieProcess[] = []
  try {
    zombies = process.platform === 'win32' ? await listWindows() : await listPosix()
  } catch (err) {
    console.error(
      '[check-zombies] scan failed:',
      err instanceof Error ? err.message : String(err),
    )
    process.exitCode = 2
    return
  }

  if (zombies.length === 0) {
    console.log('[check-zombies] CLEAN - no bdata processes running.')
    return
  }

  console.warn(`[check-zombies] FOUND ${zombies.length} running process(es):`)
  for (const zombie of zombies) {
    console.warn(`  PID ${zombie.pid}: ${zombie.command.slice(0, 200)}`)
  }
  console.warn('[check-zombies] kill them with: taskkill /F /PID <pid>  (Windows)')
  console.warn('                            or: kill -9 <pid>          (mac/linux)')
  process.exitCode = 1
}

void main()
