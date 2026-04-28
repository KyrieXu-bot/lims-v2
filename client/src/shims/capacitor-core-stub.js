/**
 * 占位：与 VITE_BUILD_SKIP_HTML5_QRCODE 联用的 Web/CI 打包。
 * Share / Filesystem / FilePicker 等会向 @capacitor/core 拉取 registerPlugin、WebPlugin、buildRequestInit 等。
 */

export const ExceptionCode = {
  Unimplemented: 'UNIMPLEMENTED',
  Unavailable: 'UNAVAILABLE',
}

export class CapacitorException extends Error {
  constructor(message, code, data) {
    super(message)
    this.message = message
    this.code = code
    this.data = data
  }
}

/**
 * @param {string} pluginName
 * @param {Record<string, () => unknown | Promise<unknown>>} [jsImplementations]
 */
export function registerPlugin(pluginName, jsImplementations = {}) {
  let loadPromise

  async function resolveImpl() {
    const webLoader = jsImplementations.web
    if (typeof webLoader !== 'function') return null
    return webLoader()
  }

  function ensureImpl() {
    if (!loadPromise) {
      loadPromise = Promise.resolve(resolveImpl())
    }
    return loadPromise
  }

  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'then' || typeof prop === 'symbol') {
          return undefined
        }
        return function proxyMethod(...args) {
          return ensureImpl().then((impl) => {
            if (!impl) {
              throw new Error(`[stub] Plugin "${pluginName}" has no web implementation`)
            }
            const fn = impl[prop]
            if (typeof fn === 'function') {
              return fn.apply(impl, args)
            }
            throw new Error(`[stub] Plugin "${pluginName}.${String(prop)}" is not a method`)
          })
        }
      },
    }
  )
}

export const Capacitor = {
  Exception: CapacitorException,
  registerPlugin,
  isNativePlatform() {
    return false
  },
  getPlatform() {
    return 'web'
  },
}

/**
 * Base class web plugins extend（与 Core 对齐，供插件包 web 实现继承）。
 */
export class WebPlugin {
  constructor() {
    this.listeners = {}
    this.retainedEventArguments = {}
    this.windowListeners = {}
  }

  addListener(eventName, listenerFunc) {
    let firstListener = false
    const listeners = this.listeners[eventName]
    if (!listeners) {
      this.listeners[eventName] = []
      firstListener = true
    }
    this.listeners[eventName].push(listenerFunc)
    const windowListener = this.windowListeners[eventName]
    if (windowListener && !windowListener.registered) {
      this.addWindowListener(windowListener)
    }
    if (firstListener) {
      this.sendRetainedArgumentsForEvent(eventName)
    }
    const remove = async () => this.removeListener(eventName, listenerFunc)
    return Promise.resolve({ remove })
  }

  async removeAllListeners() {
    this.listeners = {}
    for (const listener of Object.keys(this.windowListeners)) {
      this.removeWindowListener(this.windowListeners[listener])
    }
    this.windowListeners = {}
  }

  notifyListeners(eventName, data, retainUntilConsumed) {
    const listeners = this.listeners[eventName]
    if (!listeners) {
      if (retainUntilConsumed) {
        let args = this.retainedEventArguments[eventName]
        if (!args) {
          args = []
        }
        args.push(data)
        this.retainedEventArguments[eventName] = args
      }
      return
    }
    listeners.forEach((listener) => listener(data))
  }

  hasListeners(eventName) {
    return !!(this.listeners[eventName]?.length ?? 0)
  }

  registerWindowListener(windowEventName, pluginEventName) {
    this.windowListeners[pluginEventName] = {
      registered: false,
      windowEventName,
      pluginEventName,
      handler: (event) => {
        this.notifyListeners(pluginEventName, event)
      },
    }
  }

  unimplemented(msg = 'not implemented') {
    return new CapacitorException(msg, ExceptionCode.Unimplemented)
  }

  unavailable(msg = 'not available') {
    return new CapacitorException(msg, ExceptionCode.Unavailable)
  }

  async removeListener(eventName, listenerFunc) {
    const listeners = this.listeners[eventName]
    if (!listeners) {
      return
    }
    const index = listeners.indexOf(listenerFunc)
    this.listeners[eventName].splice(index, 1)
    if (!this.listeners[eventName].length) {
      this.removeWindowListener(this.windowListeners[eventName])
    }
  }

  addWindowListener(handle) {
    window.addEventListener(handle.windowEventName, handle.handler)
    handle.registered = true
  }

  removeWindowListener(handle) {
    if (!handle) {
      return
    }
    window.removeEventListener(handle.windowEventName, handle.handler)
    handle.registered = false
  }

  sendRetainedArgumentsForEvent(eventName) {
    const args = this.retainedEventArguments[eventName]
    if (!args) {
      return
    }
    delete this.retainedEventArguments[eventName]
    args.forEach((arg) => {
      this.notifyListeners(eventName, arg)
    })
  }
}

/** @param {Record<string,string>} headers */
function normalizeHttpHeaders(headers = {}) {
  const originalKeys = Object.keys(headers)
  const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase())
  return loweredKeys.reduce((acc, key, index) => {
    acc[key] = headers[originalKeys[index]]
    return acc
  }, {})
}

/**
 * Http / Filesystem Web 路径会用到。
 * @param {Record<string, unknown>} options
 */
export function buildRequestInit(options, extra = {}) {
  const output = Object.assign({ method: options.method || 'GET', headers: options.headers }, extra)
  const headers = normalizeHttpHeaders(options.headers || {})
  const type = headers['content-type'] || ''

  if (typeof options.data === 'string') {
    output.body = options.data
  } else if (type.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(options.data || {})) {
      params.set(key, value)
    }
    output.body = params.toString()
  } else if (type.includes('multipart/form-data') || options.data instanceof FormData) {
    const form = new FormData()
    if (options.data instanceof FormData) {
      options.data.forEach((value, key) => {
        form.append(key, value)
      })
    } else {
      for (const key of Object.keys(options.data || {})) {
        form.append(key, options.data[key])
      }
    }
    output.body = form
    const h = new Headers(output.headers || {})
    h.delete('content-type')
    output.headers = h
  } else if (type.includes('application/json') || (options.data !== undefined && typeof options.data === 'object')) {
    output.body = JSON.stringify(options.data)
  }

  return output
}
