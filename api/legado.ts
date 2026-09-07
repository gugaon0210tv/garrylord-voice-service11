import { Request, Response } from 'express'
import { FORMAT_CONTENT_TYPE } from '../service/edge'

interface LegadoData {
  name: string
  contentType: string
  id: number
  loginCheckJs: string
  loginUi: string
  loginUrl: string
  header: string
  url: string
}

module.exports = async (request: Request, response: Response) => {
  console.log('Import url: ' + request.url)

  const api = request.query['api']
  const name = request.query['name'] ?? '大声朗读'
  const voiceName = request.query['voiceName'] ?? 'zh-CN-XiaoxiaoNeural'
  const styleName = request.query['styleName']
  const styleDegree = request.query['styleDegree']
  const voiceFormat = request.query['voiceFormat']
  const lexicon = request.query['lexicon'] ?? ''
  const token = request.query['token'] ?? ''

  if (Array.isArray(voiceFormat)) {
    throw new Error(`Invalid format ${voiceFormat}`)
  }

  if (!voiceFormat) {
    throw new Error('Invalid format')
  }

const voiceFormatQuery = request.query['voiceFormat']

if (
  typeof voiceFormatQuery !== 'string' ||
  voiceFormatQuery.length === 0
) {
  throw new Error(`Invalid format ${String(voiceFormatQuery)}`)
}

const voiceFormat = voiceFormatQuery

const contentType = FORMAT_CONTENT_TYPE.get(voiceFormat)

if (!contentType) {
  throw new Error(`Invalid format ${voiceFormat}`)
}

  if (!contentType) {
    throw new Error(`Invalid format ${voiceFormat}`)
  }

  const data: LegadoData = {
    name: name === '' ? 'TTS' : String(name),
    contentType,
    id: Date.now(),
    loginCheckJs: '',
    loginUi: '',
    loginUrl: '',
    header: '',
    url: '',
  }

  const header = {
    'Content-Type': 'text/plain',
    Authorization: 'Bearer ' + String(token),
    Format: voiceFormat,
  }

  data.header = JSON.stringify(header)

  const ssml =
    `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">` +
    `<voice name="${String(voiceName)}">` +
    (lexicon === '' ? '' : `<lexicon uri="${String(lexicon)}"/>`) +
    (styleName
      ? `<mstts:express-as style="${String(styleName)}" styledegree="${String(styleDegree ?? '')}">`
      : '') +
    `<prosody rate="{{(speakSpeed - 10) * 2}}%" pitch="+0Hz">` +
    `{{String(speakText).replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}}` +
    `</prosody>` +
    (styleName ? ` </mstts:express-as>` : '') +
    `</voice>` +
    `</speak>`

  const body = {
    method: 'POST',
    body: ssml,
  }

  data.url = String(api ?? '') + ',' + JSON.stringify(body)

  response.status(200).json(data)
}
