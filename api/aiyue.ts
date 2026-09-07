import { Request, Response } from 'express'
import { retry } from '../retry'
import { service, FORMAT_CONTENT_TYPE } from '../service/edge'

module.exports = async (request: Request, response: Response) => {
  console.debug(`请求正文：${request.body}`)

  const voiceName = request.query['voiceName'] ?? 'zh-CN-XiaoxiaoNeural'
  const text = request.query['text'] ?? ''
  const speed = request.query['speed'] ?? '0.00'

  const token = process.env.TOKEN

  if (token) {
    const authorization = request.headers['authorization']

    if (authorization !== `Bearer ${token}`) {
      console.error('无效的TOKEN')
      response.status(401).json('无效的TOKEN')
      return
    }
  }

  try {
    const format = request.headers['format'] || 'audio-24khz-48kbitrate-mono-mp3'

    if (Array.isArray(format)) {
      throw new Error(`无效的音频格式：${format}`)
    }

    const contentType = FORMAT_CONTENT_TYPE.get(format)

    if (!contentType) {
      throw new Error(`无效的音频格式：${format}`)
    }

    const ssml =
      `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="zh-CN">` +
      `<voice name="${voiceName}">` +
      `<prosody rate="${speed}%">` +
      text +
      `</prosody>` +
      `</voice>` +
      `</speak>`

    const result = await retry(
      async () => {
        return await service.convert(ssml, format)
      },
      3,
      (index: number, error: unknown) => {
        console.warn(`第${index}次转换失败：${error}`)
      },
      '服务器多次尝试后转换失败',
    )

    response.sendDate = true
    response
      .status(200)
      .setHeader('Content-Type', contentType)

    response.end(result)
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`发生错误, ${error.message}`)
      response.status(503).json({ error: error.message })
    } else {
      console.error(`发生错误, ${String(error)}`)
      response.status(503).json({ error: String(error) })
    }
  }
}
