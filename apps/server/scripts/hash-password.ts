import { stdin, stdout } from 'node:process'
import { hashPassword } from '../src/auth.ts'

async function readHidden(prompt: string) {
  if (!stdin.isTTY) throw new Error('Run this command in an interactive terminal')
  stdout.write(prompt)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise<string>((resolve, reject) => {
    let value = ''
    const finish = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      stdout.write('\n')
    }
    const onData = (chunk: string) => {
      if (chunk === '\u0003') { finish(); reject(new Error('Cancelled')) }
      else if (chunk === '\r' || chunk === '\n') { finish(); resolve(value) }
      else if (chunk === '\u007f' || chunk === '\b') value = value.slice(0, -1)
      else if (chunk >= ' ') value += chunk
    }
    stdin.on('data', onData)
  })
}

const password = await readHidden('Password: ')
const confirmation = await readHidden('Confirm password: ')
if (password !== confirmation) throw new Error('Passwords do not match')
console.log(await hashPassword(password))
