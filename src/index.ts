import { Context, h, Schema, Time } from 'koishi'
import { } from '@koishijs/cache'
import { } from '@hieuzest/koishi-plugin-send'

declare module '@koishijs/cache' {
  interface Tables {
    'forward-reply': {
      cid: string
      sid: string
      content: string
    }
  }
}

export const name = 'forward-reply'
export const inject = ['cache', 'sendMessage']

export interface Config {
  mode: 'client' | 'server' | 'off'
  targetChannel: string
  forwardCommands: string[]
  replyTimeout: number
}

export const Config: Schema<Config> = Schema.object({
  mode: Schema.union(['client', 'server', 'off']).default('off'),
  targetChannel: Schema.string(),
  forwardCommands: Schema.array(Schema.string()).default([]),
  replyTimeout: Schema.number().default(300 * Time.second),
})

export function apply(ctx: Context, config: Config) {
  if (config.mode === 'client') {
    ctx.before('command/execute', async (argv) => {
      let command = argv.command
      while (command) {
        if (config.forwardCommands.includes(command.name)) {
          // not resolve alias here for simplicity
          const receipt = await ctx.sendMessage(config.targetChannel, argv.session.content)
          if (receipt.length) {
            // save to reply map
            ctx.cache.set('forward-reply', receipt[0], {
              cid: argv.session.cid,
              sid: argv.session.sid,
              content: argv.session.content,
            }, config.replyTimeout)
            return ''
          }
          break
        }
        command = command.parent
      }
    })

    ctx.middleware(async (session, next) => {
      // prevent reverse replying
      if (session.cid === config.targetChannel) return
      if (session.quote) {
        const reply = await ctx.cache.get('forward-reply', session.quote.id)
        if (reply) {
          ctx.bots[reply.sid]?.sendMessage(reply.cid, reply.content)
          return
        }
      }
      return next()
    })
  } else if (config.mode === 'server') {
    ctx.before('send', async (session, options) => {
      if (options?.session?.cid === config.targetChannel) {
        if (session.elements[0]?.type !== 'quote') {
          session.elements.unshift(h.quote(options.session.messageId))
        }
      }
    })
  }
}
