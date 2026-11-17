// Email worker for the bill inbox. It parses nothing: the raw message is
// streamed to the cloud function, which decides whether to keep it.
// Sizes are the contract's MAX_MESSAGE_BYTES (8 MiB), kept in step by hand
// because this worker has no build step and cannot import the cloud code.
const MAX_BYTES = 8 * 1024 * 1024

// Short plain sentences the sending server shows its user in the bounce.
const REFUSALS = {
  unknown_address: 'This address does not exist.',
  off: 'This address is not accepting mail.',
  plan: 'This address is not accepting mail.',
  sender_not_listed: 'Sender not allowed for this address.',
  not_authenticated: 'Sender could not be verified.',
  too_large: 'Message is too large.',
  full: 'This mailbox is full.',
  unreadable: 'Message could not be read.',
}

export default {
  async email(message, env) {
    // A permanent refusal for a message we would never keep anyway.
    if (message.rawSize > MAX_BYTES) {
      message.setReject(REFUSALS.too_large)
      return
    }

    // FixedLengthStream gives the request a Content-Length, so the mail is
    // passed along as it arrives, never held in memory or parsed here.
    const { readable, writable } = new FixedLengthStream(message.rawSize)
    const copy = message.raw.pipeTo(writable)
    copy.catch(() => {}) // the fetch below reports the failure

    let res
    try {
      res = await fetch(env.INGEST_URL, {
        method: 'POST',
        headers: {
          'content-type': 'message/rfc822',
          'x-inbox-secret': env.INGEST_SECRET || '',
          'x-rcpt-to': message.to,
          'x-mail-from': message.from,
        },
        body: readable,
      })
    } catch (e) {
      // Network trouble: throwing makes Cloudflare answer with a temporary
      // failure, so the sending server keeps the mail and tries again.
      throw new Error('inbox: cloud unreachable')
    }

    // Anything but a clean 200 (5xx, a wrong secret, a bad deploy) is our
    // problem, not the sender's: ask them to retry instead of losing the mail.
    if (res.status !== 200) throw new Error('inbox: cloud answered ' + res.status)

    let answer
    try {
      answer = await res.json()
    } catch (e) {
      throw new Error('inbox: cloud answer unreadable')
    }

    if (answer && answer.accept === true) return
    if (answer && answer.accept === false) {
      message.setReject(REFUSALS[answer.reason] || 'Message not accepted.')
      return
    }
    throw new Error('inbox: unexpected cloud answer')
  },
}
