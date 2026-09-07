import { randomBytes } from 'crypto'
import { WebSocket } from 'ws'

export const FORMAT_CONTENT_TYPE = new Map([
  ['raw-16khz-16bit-mono-pcm', 'audio/basic'],
  ['raw-48khz-16bit-mono-pcm', 'audio/basic'],
  ['raw-8khz-8bit-mono-mulaw', 'audio/basic'],
  ['raw-8khz-8bit-mono-alaw', 'audio/basic'],

  ['raw-16khz-16bit-mono-truesilk', 'audio/SILK'],
  ['raw-24khz-16bit-mono-truesilk', 'audio/SILK'],

  ['riff-16khz-16bit-mono-pcm', 'audio/x-wav'],
  ['riff-24khz-16bit-mono-pcm', 'audio/x-wav'],
  ['riff-48khz-16bit-mono-pcm', 'audio/x-wav'],
  ['riff-8khz-8bit-mono-mulaw', 'audio/x-wav'],
  ['riff-8khz-8bit-mono-alaw', 'audio/x-wav'],

  ['audio-16khz-32kbitrate-mono-mp3', 'audio/mpeg'],
  ['audio-16khz-64kbitrate-mono-mp3', 'audio/mpeg'],
  ['audio-16khz-128kbitrate-mono-mp3', 'audio/mpeg'],
  ['audio-24khz-48kbitrate-mono-mp3', 'audio/mpeg'],
  ['audio-24khz-96kbitrate-mono-mp3', 'audio/mpeg'],
  ['audio-24khz-160kbitrate-mono-mp3', 'audio/mpeg'],
  ['audio-48khz-96kbitrate-mono-mp3', 'audio/mpeg'],
  ['audio-48khz-192kbitrate-mono-mp3', 'audio/mpeg'],

  ['webm-16khz-16bit-mono-opus', 'audio/webm; codec=opus'],
  ['webm-24khz-16bit-mono-opus', 'audio/webm; codec=opus'],

  ['ogg-16khz-16bit-mono-opus', 'audio/ogg; codecs=opus; rate=16000'],
  ['ogg-24khz-16bit-mono-opus', 'audio/ogg; codecs=opus; rate=24000'],
  ['ogg-48khz-16bit-mono-opus', 'audio/ogg; codecs=opus; rate=48000'],
])

interface PromiseExecutor {
  resolve: (value?: any) => void
  reject: (reason?: any) => void
}

export class Service {
  private ws: WebSocket | null = null

  private executorMap: Map<string, PromiseExecutor>
  private bufferMap: Map<string, Buffer>

  private timer: NodeJS.Timeout | null = null

  constructor() {
    this.executorMap = new Map()
    this.bufferMap = new Map()
  }

  private async connect(): Promise<WebSocket> {
    const connectionId = randomBytes(16).toString('hex').toLowerCase()

    const url =
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
      `?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4` +
      `&ConnectionId=${connectionId}`

    const ws = new WebSocket(url, {
      host: 'speech.platform.bing.com',
      origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/103.0.5060.66 Safari/537.36 ' +
          'Edg/103.0.1264.44',
      },
    })

    return new Promise((resolve, reject) => {
      ws.on('open', () => {
        resolve(ws)
      })

      ws.on('close', (code, reason) => {
        this.ws = null

        if (this.timer) {
          clearTimeout(this.timer)
          this.timer = null
        }

        for (const [key, value] of this.executorMap) {
          value.reject(`连接已关闭: ${reason} ${code}`)
        }

        this.executorMap.clear()
        this.bufferMap.clear()

        console.info(`连接已关闭： ${reason} ${code}`)
      })

      ws.on('message', (message, isBinary) => {
        const pattern = /X-RequestId:(?<id>[a-z|0-9]+)/

        if (!isBinary) {
          console.debug('收到文本消息：%s', message)

          const data = message.toString()

          if (data.includes('Path:turn.start')) {
            const matches = data.match(pattern)
            const requestId = matches?.groups?.id

            if (!requestId) {
              console.warn('无法从 turn.start 消息中获取 RequestId')
              return
            }

            console.debug(`开始传输：${requestId}……`)
            this.bufferMap.set(requestId, Buffer.from([]))
          } else if (data.includes('Path:turn.end')) {
            const matches = data.match(pattern)
            const requestId = matches?.groups?.id

            if (!requestId) {
              console.warn('无法从 turn.end 消息中获取 RequestId')
              return
            }

            const executor = this.executorMap.get(requestId)

            if (executor) {
              this.executorMap.delete(requestId)

              const result = this.bufferMap.get(requestId)

              executor.resolve(result)

              console.debug(`传输完成：${requestId}……`)
            } else {
              console.debug(`请求已被丢弃：${requestId}`)
            }
          }
        } else {
          const separator = 'Path:audio\r\n'
          const data = message as Buffer

          const separatorIndex = data.indexOf(separator)

          if (separatorIndex === -1) {
            console.warn('音频消息中找不到 Path:audio 分隔자')
            return
          }

          const contentIndex = separatorIndex + separator.length

          const headers = data.slice(2, contentIndex).toString()

          const matches = headers.match(pattern)
          const requestId = matches?.groups?.id

          if (!requestId) {
            console.warn('无法从音频消息中获取 RequestId')
            return
          }

          const content = data.slice(contentIndex)

          console.debug(
            `收到音频片段：${requestId} Length: ${content.length}\n${headers}`,
          )

          let buffer = this.bufferMap.get(requestId)

          if (buffer) {
            buffer = Buffer.concat([buffer, content])
            this.bufferMap.set(requestId, buffer)
          } else {
            console.debug(`请求已被丢弃：${requestId}`)
          }
        }
      })

      ws.on('error', (error) => {
        console.error(`连接失败： ${error}`)
        reject(`连接失败： ${error}`)
      })

      ws.on('ping', (data) => {
        console.debug('ping %s', data)
      })

      ws.on('pong', (data) => {
        console.debug('pong %s', data)
      })
    })
  }

  public async convert(ssml: string, format: string) {
    if (this.ws == null || this.ws.readyState !== WebSocket.OPEN) {
      console.info('准备连接服务器……')

      const connection = await this.connect()

      this.ws = connection

      console.info('连接成功！')
    }

    // TypeScript가 this.ws가 null이 아님을 확실하게 알 수 있도록
    const ws = this.ws

    if (ws == null || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 연결이 준비되지 않았습니다.')
    }

    const requestId = randomBytes(16).toString('hex').toLowerCase()

    const result = new Promise((resolve, reject) => {
      // 서버에서 결과가 돌아올 때까지 대기
      this.executorMap.set(requestId, {
        resolve,
        reject,
      })

      // 설정 메시지
      const configData = {
        context: {
          synthesis: {
            audio: {
              metadataoptions: {
                sentenceBoundaryEnabled: 'false',
                wordBoundaryEnabled: 'false',
              },
              outputFormat: format,
            },
          },
        },
      }

      const configMessage =
        `X-Timestamp:${Date()}\r\n` +
        'Content-Type:application/json; charset=utf-8\r\n' +
        'Path:speech.config\r\n\r\n' +
        JSON.stringify(configData)

      console.info(`开始转换：${requestId}……`)
      console.debug(
        `准备发送配置请求：${requestId}\n`,
        configMessage,
      )

      ws.send(configMessage, (configError) => {
        if (configError) {
          console.error(
            `配置请求发送失败：${requestId}\n`,
            configError,
          )
        }

        // SSML 메시지
        const ssmlMessage =
          `X-Timestamp:${Date()}\r\n` +
          `X-RequestId:${requestId}\r\n` +
          'Content-Type:application/ssml+xml\r\n' +
          'Path:ssml\r\n\r\n' +
          ssml

        console.debug(
          `准备发送SSML消息：${requestId}\n`,
          ssmlMessage,
        )

        ws.send(ssmlMessage, (ssmlError) => {
          if (ssmlError) {
            console.error(
              `SSML消息发送失败：${requestId}\n`,
              ssmlError,
            )
          }
        })
      })
    })

    // 새로운 요청이 들어오면 기존 타이머 제거
    if (this.timer) {
      console.debug('收到新的请求，清除超时定时器')
      clearTimeout(this.timer)
      this.timer = null
    }

    // 10초 동안 요청이 없으면 연결 종료
    console.debug('创建新的超时定时器')

    this.timer = setTimeout(() => {
      const currentWs = this.ws

      if (
        currentWs &&
        currentWs.readyState === WebSocket.OPEN
      ) {
        console.debug(
          '已经 10 秒没有请求，主动关闭连接',
        )

        currentWs.close(1000)
        this.timer = null
      }
    }, 10000)

    const data = await Promise.race([
      result,

      new Promise((resolve, reject) => {
        // 10초 동안 결과가 없으면 타임아웃
        setTimeout(() => {
          this.executorMap.delete(requestId)
          this.bufferMap.delete(requestId)

          reject('转换超时')
        }, 10000)
      }),
    ])

    console.info(`转换完成：${requestId}`)
    console.info(`剩余 ${this.executorMap.size} 个任务`)

    return data
  }
}

export const service = new Service()
