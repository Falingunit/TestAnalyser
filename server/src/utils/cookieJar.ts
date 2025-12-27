const splitSetCookie = (headerValue: string) => {
  return headerValue.split(/,(?=[^;]+=)/)
}

export class CookieJar {
  private cookies = new Map<string, string>()

  ingest(headers: Headers) {
    const getSetCookie = (headers as Headers & {
      getSetCookie?: () => string[]
    }).getSetCookie

    const values = getSetCookie ? getSetCookie.call(headers) : null
    if (values && values.length > 0) {
      values.forEach((cookie) => this.addCookie(cookie))
      return
    }

    const raw = headers.get('set-cookie')
    if (!raw) {
      return
    }
    splitSetCookie(raw).forEach((cookie) => this.addCookie(cookie))
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  private addCookie(raw: string) {
    const [pair] = raw.split(';')
    if (!pair) {
      return
    }
    const index = pair.indexOf('=')
    if (index === -1) {
      return
    }
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (!name) {
      return
    }
    this.cookies.set(name, value)
  }
}
