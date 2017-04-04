/* eslint-env mocha */
'use strict'
const assert = require('assert')
const JsonRpcEngine = require('json-rpc-engine')
const RpcBlockTracker = require('../src/index')
const TestBlockMiddleware = require('./util/testBlockMiddleware')

describe('basic', () => {
  it('constructor', (done) => {
    assert.doesNotThrow(() => {
      const provider = {}
      const blockTracker = new RpcBlockTracker({ provider })
      blockTracker.getTrackingBlock()
    }, 'constructor did not error')
    done()
  })

  it('walking', (done) => {
    const engine = new JsonRpcEngine()
    const testBlockSource = new TestBlockMiddleware()
    testBlockSource.nextBlock()
    testBlockSource.nextBlock()
    engine.push(testBlockSource.createMiddleware())

    const provider = {
      sendAsync: engine.handle.bind(engine)
    }
    const blockTracker = new RpcBlockTracker({ provider })

    const witnessedBlocks = {}

    blockTracker.once('block', () => {
      // saw 1st block
      witnessedBlocks['1'] = true
      blockTracker.once('block', () => {
        // saw 2nd block
        witnessedBlocks['2'] = true
        blockTracker.once('block', () => {
          // saw 3rd block
          witnessedBlocks['3'] = true
        })
      })
    })

    blockTracker.once('latest', () => {
      // saw latest block
      witnessedBlocks['latest'] = true
      blockTracker.stop()

      assert(witnessedBlocks['1'], 'saw blockRef "1"')
      assert(witnessedBlocks['2'], 'saw blockRef "2"')
      assert(witnessedBlocks['3'], 'saw blockRef "3"')
      assert(witnessedBlocks['latest'], 'saw blockRef "latest"')
      done()
    })

    blockTracker.start({ fromBlock: '0x01' })
  })
})
