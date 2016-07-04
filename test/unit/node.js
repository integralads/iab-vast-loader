import express from 'express'
import sinon from 'sinon'
import path from 'path'
import Loader from '../../src/'

describe('Loader', () => {
  const fixturesPath = path.resolve(__dirname, '../fixtures')
  const proxyFrom = 'http://demo.tremormedia.com/proddev/vast/vast_inline_linear.xml'
  const proxyTo = 'tremor-video/vast_inline_linear.xml'

  let oldFetch
  let server
  let baseUrl

  const createLoader = (file, options) => new Loader(baseUrl + file, options)

  const proxifyFetch = () => {
    oldFetch = Loader.prototype._fetch
    Loader.prototype._fetch = async function (uri) {
      if (uri === proxyFrom) {
        uri = baseUrl + proxyTo
      }
      return oldFetch.call(this, uri)
    }
  }

  const unproxifyFetch = () => {
    Loader.prototype._fetch = oldFetch
  }

  before((cb) => {
    const app = express()
    app.use(express.static(fixturesPath))
    server = app.listen(() => {
      baseUrl = 'http://localhost:' + server.address().port + '/'
      proxifyFetch()
      cb()
    })
  })

  after((cb) => {
    unproxifyFetch()
    server.close(cb)
  })

  describe('#load()', () => {
    it('loads the InLine', async () => {
      const loader = createLoader('tremor-video/vast_inline_linear.xml')
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(1)
    })

    it('loads the Wrapper', async () => {
      const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml')
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(2)
    })

    it('throws when maxDepth is reached', async () => {
      expect((async () => {
        const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml', {maxDepth: 1})
        await loader.load()
      })()).to.be.rejectedWith(Error)
    })

    it('throws on tags without ads', () => {
      expect((async () => {
        const loader = createLoader('no-ads.xml')
        await loader.load()
      })()).to.be.rejectedWith(Error, 'No ads found')
    })

    it('throws on HTTP errors', () => {
      expect((async () => {
        const loader = createLoader('four-oh-four')
        await loader.load()
      })()).to.be.rejectedWith(Error, /404/)
    })
  })

  // TODO Test event data
  describe('#emit()', () => {
    for (const type of ['willFetch', 'didFetch', 'willParse', 'didParse']) {
      it(`emits ${type}`, async () => {
        const spy = sinon.spy()
        const loader = createLoader('tremor-video/vast_inline_linear.xml')
        loader.on(type, spy)
        await loader.load()
        expect(spy.called).to.be.true
      })
    }

    for (const type of ['willFetch', 'didFetch', 'willParse', 'didParse']) {
      it(`emits ${type} once per tag`, async () => {
        const spy = sinon.spy()
        const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml')
        loader.on(type, spy)
        await loader.load()
        expect(spy.calledTwice).to.be.true
      })
    }

    it('emits error on errors', async () => {
      const spy = sinon.spy()
      const loader = createLoader('four-oh-four')
      loader.on('error', spy)
      try {
        await loader.load()
      } catch (err) {}
      expect(spy.calledOnce).to.be.true
    })
  })
})