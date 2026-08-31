// 极简 TCP 行式 JSON 客户端（与 DecompileBridge.py 通信）
import net from 'node:net'

export function jsonRequest(port, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port })
    let buf = ''
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('ghidra socket 超时')) }, timeoutMs)
    sock.on('connect', () => sock.write(JSON.stringify(payload) + '\n'))
    sock.on('data', (d) => {
      buf += d.toString('utf8')
      const idx = buf.indexOf('\n')
      if (idx >= 0) {
        clearTimeout(timer)
        sock.destroy()
        const line = buf.slice(0, idx)
        try { resolve(JSON.parse(line)) } catch { reject(new Error('桥接响应异常: ' + line.slice(0, 300))) }
      }
    })
    sock.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}
