import { debounce, uniqWith } from 'lodash'
import fetchRefs from './referenceFetcher'

describe('FetchRefs util', () => {
  // Mocking console error function
  global.console.error = jest.fn()

  const parcels = [
    { id: 'parcel_01', name: 'parcel_01', address: 'address_01', collect: 'collect_01', stats: 'stats_01' },
    { id: 'parcel_02', name: 'parcel_02', address: 'address_02', collect: 'collect_02', stats: 'stats_02' },
    { id: 'parcel_03', name: 'parcel_03', address: 'address_03', collect: 'collect_02', stats: 'stats_03' },
  ]
  const entityFactory = id => ({ id, name: `name_${id}`, org: 'organization_01', user: 'user_02' })
  const entitiesFactory = ids => ids.map(id => ({ id, name: `name_${id}`, org: 'organization_01', user: 'user_02' }))
  const parcelsPromise = () => new Promise(resolve => resolve({ action: 'getParcel', parcels }))
  const subObjectPromise = (id, entity) => new Promise(resolve => resolve({ action: 'getSmthg',
    [entity]: entityFactory(id) }))
  const subArrayPromise = (ids, entity) => new Promise(resolve => resolve({ action: 'getSmthg',
    [entity]: entitiesFactory(ids) }))

  const wrongConfig = () => ({
    entity: 'parcels',
    func: 'Not a function',
  })

  const oneLevelConfig = callback => ({
    entity: 'parcels',
    func: () => {
      callback('parcels')
      return parcelsPromise()
    },
  })

  const twoLevelConfig = callback => ({
    entity: 'parcels',
    func: parcelsPromise,
    refs: [{
      entity: 'collect',
      func: (parcelId, collectId) => {
        callback([parcelId, collectId])
        return subObjectPromise(collectId, 'collect')
      },
    }],
  })

  const threeLevelConfig = (callback1, callback2) => ({
    entity: 'parcels',
    func: parcelsPromise,
    refs: [{
      entity: 'collect',
      func: (parcelId, collectId) => subObjectPromise(collectId, 'collect'),
    }, {
      entity: 'address',
      func: (parcelId, addressId) => {
        callback1([parcelId, addressId])
        return subObjectPromise(addressId, 'address')
      },
      refs: [{
        entity: 'org',
        func: (parcelId, addressId, orgId) => subObjectPromise(orgId, 'org'),
      }, {
        entity: 'user',
        func: (parcelId, addressId, userId) => {
          callback2([parcelId, addressId, userId])
          return subObjectPromise(userId, 'user')
        },
      }],
    }],
  })

  const batchConfig = (callback) => ({
    entity: 'parcels',
    func: parcelsPromise,
    refs: [{
      entity: 'collect',
      func: (parcelId, collectId) => subObjectPromise(collectId, 'collect'),
    }, {
      entity: 'stats',
      batch: true,
      func: (parcelId, statsIds) => {
        callback([parcelId, statsIds])
        return subArrayPromise(statsIds, 'stats')
      },
    }],
  })

  const noCacheConfig = (callback1, callback2) => ({
    entity: 'parcels',
    func: parcelsPromise,
    refs: [{
      entity: 'address',
      func: (parcelId, addressId) => subObjectPromise(addressId, 'address'),
    }, {
      entity: 'addresses',
      relationName: 'address',
      batch: true,
      noCache: true,
      func: (parcelId, addressesIds) => {
        callback1([parcelId, addressesIds])
        return subArrayPromise(addressesIds, 'addresses')
      },
      refs: [{
        entity: 'address',
        noCache: true,
        func: (parcelId, addressId) => {
          callback2([parcelId, addressId])
          return subObjectPromise(addressId, 'address')
        },
      }],
    }],
  })

  it('Calls the func with one level of configuration', done => {
    const callback = data => {
      expect(data).toBe('parcels')
      done()
    }
    fetchRefs(oneLevelConfig(callback))
  })
  it('Calls func & sub-func with two levels of configuration', done => {
    const store = []
    const callback = () => {
      const uniqCollects = uniqWith(parcels.map(parcel => [parcel.id, parcel.collect]), (a, b) => a[1] === b[1])
      expect(store).toEqual(uniqCollects)
      done()
    }
    const debounceCallback = debounce(callback, 10)
    const registerCallback = data => {
      store.push(data)
      debounceCallback()
    }
    fetchRefs(twoLevelConfig(registerCallback))
  })
  it('Calls func & sub-funcs with three levels of configuration', done => {
    const store1 = []
    const callback1 = () => {
      const uniqAddresses = uniqWith(parcels.map(parcel => [parcel.id, parcel.address]), (a, b) => a[1] === b[1])
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
      const uniqAddresses = uniqWith(parcels.map(parcel =>
        [parcel.id, parcel.address, 'user_02']), (a, b) => a[2] === b[2])
      expect(store2).toEqual(uniqAddresses)
      done()
    }
    const debounceCallback2 = debounce(callback2, 10)
    const registerCallback2 = data => {
      store2.push(data)
      debounceCallback2()
    }

    fetchRefs(threeLevelConfig(registerCallback1, registerCallback2))
  })
  it('Calls sub-func with an array when batch asked', done => {
    const callback = statsIds => {
      const uniqStats = uniqWith(parcels.map(parcel => parcel.stats, (a, b) => a[1] === b[1]))
      expect(statsIds).toEqual([parcels.map(parcel => parcel.id), uniqStats])
      done()
    }

    fetchRefs(batchConfig(callback))
  })
  it('Calls sub-func with the full array when no-cache asked', done => {
    const callback1 = addressesId => {
      const uniqAddresses = uniqWith(parcels.map(parcel => parcel.address, (a, b) => a[1] === b[1]))
      expect(addressesId).toEqual([parcels.map(parcel => parcel.id), uniqAddresses])
      // done()
    }
    const store2 = []
    const callback2 = () => {
      const parcelIds = parcels.map(parcel => parcel.id)
      const uniqAddresses = uniqWith(parcels.map(parcel =>
        [parcelIds, parcel.address]), (a, b) => a[2] !== b[2])
      expect(store2).toEqual(uniqAddresses)
      done()
    }
    const debounceCallback2 = debounce(callback2, 10)
    const registerCallback2 = data => {
      store2.push(data)
      debounceCallback2()
    }

    fetchRefs(noCacheConfig(callback1, registerCallback2))
  })
  it('Calls the error function when the func givent is not a function', () => {
    fetchRefs(wrongConfig)
    expect(console.error).toBeCalled()
  })
})
