import { debounce, uniqWith, uniq } from 'lodash'
import fetchRefs from './referenceFetcher'

describe('FetchRefs util', () => {
  const parcels = [
    { id: 'parcel_01',
      name: 'parcel_01',
      address: 'address_01',
      collect: 'collect_01',
      stats: 'stats_01',
      promFail: 'promFail_01' },
    { id: 'parcel_02',
      name: 'parcel_02',
      address: 'address_02',
      collect: 'collect_02',
      stats: 'stats_02',
      promFail: 'promFail_01' },
    { id: 'parcel_03',
      name: 'parcel_03',
      address: 'address_03',
      collect: 'collect_02',
      stats: 'stats_03',
      promFail: 'promFail_01' },
  ]
  const entityFactory = id => ({ id, name: `name_${id}`, org: 'organization_01', user: 'user_02', action: 'action_01' })
  const entitiesFactory = ids => ids.map(id => ({ id, name: `name_${id}`, org: 'organization_01', user: 'user_02' }))
  const parcelsPromise = () => new Promise(resolve => resolve(parcels))
  const subObjectPromise = id => new Promise(resolve => resolve(entityFactory(id)))
  const subArrayPromise = ids => new Promise(resolve => resolve(entitiesFactory(ids)))

  const sameRootFunction = (callback) => {
    callback()
    return parcelsPromise()
  }

  const wrongConfig = () => ({
    entity: 'parcels',
    fetch: 'Not a function',
  })
  const promiseErrorConfig = () => ({
    entity: 'parcels',
    fetch: parcelsPromise,
    refs: [{
      entity: 'promFail',
      fetch: () => new Promise((resolve, reject) => reject('Error in Promise')),
    }],
  })
  const promiseErrorReturn = callback => ({
    entity: 'parcels',
    fetch: parcelsPromise,
    noCache: true,
    refs: [{
      entity: 'promFail',
      batch: true,
      fetch: ids => {
        callback(ids)
        return new Promise((resolve, reject) => resolve('Error in Promise'))
      },
    }],
  })
  const configWithUnknownRef = () => ({
    entity: 'parcels',
    fetch: parcelsPromise,
    refs: [{
      entity: 'doesNotExist',
      optional: true,
      fetch: noId => subObjectPromise(noId),
    }],
  })

  const oneLevelConfig = callbackParcel => ({
    entity: 'parcels',
    fetch: () => sameRootFunction(callbackParcel),
  })

  const twoLevelConfig = (callback, callbackParcel) => ({
    entity: 'parcels',
    fetch: () => sameRootFunction(callbackParcel),
    refs: [{
      entity: 'collect',
      fetch: collectId => {
        callback(collectId)
        return subObjectPromise(collectId)
      },
    }],
  })

  const threeLevelConfig = (callback1, callback2, callbackParcel) => ({
    entity: 'parcels',
    fetch: (notTheSame) => {
      callbackParcel()
      return parcelsPromise()
    },
    refs: [{
      entity: 'collect',
      fetch: collectId => subObjectPromise(collectId),
    }, {
      entity: 'address',
      fetch: addressId => {
        callback1(addressId)
        return subObjectPromise(addressId)
      },
      refs: [{
        entity: 'org',
        fetch: orgId => subObjectPromise(orgId),
      }, {
        entity: 'user',
        fetch: userId => {
          callback2(userId)
          return subObjectPromise(userId)
        },
      }],
    }],
  })

  const batchConfig = (callback, callback2) => ({
    entity: 'parcels',
    fetch: parcelsPromise,
    refs: [{
      entity: 'collect',
      fetch: collectId => subObjectPromise(collectId),
    }, {
      entity: 'stats',
      batch: true,
      fetch: statsIds => {
        callback(statsIds)
        return subArrayPromise(statsIds)
      },
      refs: [{
        entity: 'org',
        batch: true,
        noCache: true,
        fetch: orgs => {
          callback2(orgs)
          return subArrayPromise(orgs)
        },
      }],
    }],
  })

  const noCacheConfig = (callback1, callback2, callback3) => ({
    entity: 'parcels',
    fetch: parcelsPromise,
    refs: [{
      entity: 'address',
      fetch: addressId => subObjectPromise(addressId),
    }, {
      entity: 'addresses',
      relationName: 'address',
      batch: true,
      noCache: true,
      fetch: addressesIds => {
        callback1(addressesIds)
        return subArrayPromise(addressesIds)
      },
      refs: [{
        entity: 'address',
        noCache: true,
        fetch: addressId => {
          callback3(addressId)
          return subObjectPromise(addressId)
        },
      }],
    }, {
      entity: 'address',
      noCache: true,
      fetch: addressId => {
        callback2(addressId)
        return subObjectPromise(addressId)
      },
    }, {
      entity: 'address',
      // noCache: true,
      fetch: addressId => { // Should not be called as already fetched
        callback3(addressId)
        return subObjectPromise(addressId)
      },
    }],
  })

  const retrieveSubOfAlreadyFetched = (callback) => ({
    entity: 'parcels',
    fetch: parcelsPromise,
    refs: [{
      entity: 'address',
      fetch: addressId => subObjectPromise(addressId),
    }, {
      entity: 'address',
      fetch: addressId => subObjectPromise(addressId),
      refs: [{
        entity: 'action', // Even if address has already been fetched, action need to be fetch
        fetch: actionId => {
          callback(actionId)
          return subObjectPromise(actionId)
        },
      }],
    }],
  })

  it('Calls the fetch with one level of configuration', done => {
    const callbackParcel = jest.fn()

    const store = []
    const callback = () => {
      const uniqCollects = uniqWith(parcels.map(parcel => parcel.collect), (a, b) => a === b)
      expect(store).toEqual(uniqCollects)
      fetchRefs(oneLevelConfig(callbackParcel))

      expect(callbackParcel).toHaveBeenCalledTimes(1)
      done()
    }
    const debounceCallback = debounce(callback, 10)
    const registerCallback = data => {
      store.push(data)
      debounceCallback()
    }
    fetchRefs(twoLevelConfig(registerCallback, callbackParcel))

    // This test depend on firstLevelConfiguration
    expect(callbackParcel).toHaveBeenCalledTimes(1)
  })
  it('Calls fetch & sub-fetchs with three levels of configuration', done => {
    const store1 = []
    const callback1 = () => {
      const uniqAddresses = uniqWith(parcels.map(parcel => parcel.address), (a, b) => a === b)
      expect(store1).toEqual(uniqAddresses)
      // done()
    }
    const debounceCallback1 = debounce(callback1, 10)
    const registerCallback1 = data => {
      store1.push(data)
      debounceCallback1()
    }
    const store2 = []
    const callback2 = () => {
      expect(store2).toEqual(['user_02'])
      done()
    }
    const debounceCallback2 = debounce(callback2, 10)
    const registerCallback2 = data => {
      store2.push(data)
      debounceCallback2()
    }

    const callbackParcel = jest.fn()
    fetchRefs(threeLevelConfig(registerCallback1, registerCallback2, callbackParcel))

    // This test depend on firstLevelConfiguration
    expect(callbackParcel).toBeCalled()
  })
  it('Calls sub-fetch with an array when batch asked', done => {
    const callback2 = lastArg => {
      expect(lastArg).toEqual(['organization_01'])
      done()
    }
    const debounceCallback2 = debounce(callback2, 100)
    const callback = statsIds => {
      const uniqStats = uniqWith(parcels.map(parcel => parcel.stats), (a, b) => a === b)
      expect(statsIds).toEqual(uniqStats)
    }

    fetchRefs(batchConfig(callback, debounceCallback2))
  })
  it('Calls sub-fetch with the full array when no-cache asked', done => {
    const callback1 = addressesId => {
      const uniqAddresses = uniqWith(parcels.map(parcel => parcel.address), (a, b) => a === b)
      expect(addressesId).toEqual(uniqAddresses)
      // done()
    }
    const store3 = []
    const callback3 = () => {
      // This test depends on previous tests, please be careful
      expect(store3).toEqual([null])
      done()
    }
    const debounceCallback3 = debounce(callback3, 100)
    const registerCallback3 = data => {
      store3.push(data)
      debounceCallback3()
    }
    const store2 = []
    const callback2 = () => {
      const uniqAddresses = uniqWith(parcels.map(parcel => parcel.address), (a, b) => a === b)
      expect(store2).toEqual(uniqAddresses)
      // done()
      // Launch register3 as it should not be called and we test its store
      registerCallback3(null)
    }
    const debounceCallback2 = debounce(callback2, 10)
    const registerCallback2 = data => {
      store2.push(data)
      debounceCallback2()
    }

    fetchRefs(noCacheConfig(callback1, registerCallback2, registerCallback3))
  })
  it('Calls sub-fetch even if parent already fetched', done => {
    const store = []
    const callback = () => {
      expect(store).toEqual(['action_01'])
      done()
    }
    const debounceCallback = debounce(callback, 10)
    const registerCallback = data => {
      store.push(data)
      debounceCallback()
    }

    fetchRefs(retrieveSubOfAlreadyFetched(registerCallback))
  })
  it('Calls the error function when the fetch or sub fetch given is not a function', done => {
    const callback = () => {
      expect(global.console.error).toHaveBeenCalledTimes(2)
      done()
    }
    const debounceCallback = debounce(callback, 10)
    // Mocking console error function
    global.console.error = jest.fn().mockImplementation(debounceCallback)
    fetchRefs(wrongConfig())
    fetchRefs(promiseErrorConfig())
  })
  it('Does not throw errors when the ref is optional', done => {
    const callback = () => {
      expect(global.console.error).toHaveBeenCalledTimes(0) // Should not be called 3 times (parcels.length)
      done()
    }
    const debounceCallback = debounce(callback, 100)
    // Mocking console error function
    global.console.error = jest.fn().mockImplementation(debounceCallback)
    fetchRefs(configWithUnknownRef())
    // Calling debounceCallback as to start the debouncing
    debounceCallback()
  })
  it('Does not recall the sub-fetch function with the same ids if it wasn\'t returned in the previous fetch', done => {
    const store = []
    const callback = () => {
      expect(uniq(store).length === store.length).toBeTruthy()
      done()
    }
    const debounceCallback = debounce(callback, 100)
    fetchRefs(promiseErrorReturn(ids => {
      store.push(...ids)
      debounceCallback()
    }))
    setTimeout(() => fetchRefs(promiseErrorReturn(ids => {
      store.push(...ids)
      debounceCallback()
    })), 10)
  })
})
