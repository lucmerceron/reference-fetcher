import { debounce, uniqWith } from 'lodash'
import fetchRefs from './referenceFetcher'

describe('FetchRefs util', () => {
  const parcels = [
    { id: 'parcel_01', name: 'parcel_01', address: 'address_01', collect: 'collect_01' },
    { id: 'parcel_02', name: 'parcel_02', address: 'address_02', collect: 'collect_02' },
    { id: 'parcel_03', name: 'parcel_03', address: 'address_03', collect: 'collect_02' },
  ]
  const entityFactory = id => ({ id, name: `name_${id}`, org: 'organization_01', user: 'user_02' })
  const parcelsPromise = () => new Promise(resolve => resolve({ action: 'getParcel', parcels }))
  const subObjectPromise = (id, entity) => new Promise(resolve => resolve({ action: 'getSmthg',
    [entity]: entityFactory(id) }))

  const oneLevelConfig = callback => ({
    entity: 'parcels',
    func: () => {
      callback('parcels')
      return parcelsPromise()
    },
  })

  const twoLevelConfig = callback => ({
    entity: 'parcels',
    func: () => parcelsPromise(),
    refs: [{
      entity: 'collect',
      func: (parcelId, collectId) => {
        callback([parcelId, collectId])
        return subObjectPromise(collectId, 'collect', [parcelId, collectId])
      },
    }],
  })

  const threeLevelConfig = (callback1, callback2) => ({
    entity: 'parcels',
    func: () => parcelsPromise(),
    refs: [{
      entity: 'collect',
      func: (parcelId, collectId) => subObjectPromise(collectId, 'collect', [parcelId, collectId]),
    }, {
      entity: 'address',
      func: (parcelId, addressId) => {
        callback1([parcelId, addressId])
        return subObjectPromise(addressId, 'address', [parcelId, addressId])
      },
      refs: [{
        entity: 'org',
        func: (parcelId, addressId, orgId) => subObjectPromise(orgId, 'org', [parcelId, addressId, orgId]),
      }, {
        entity: 'user',
        func: (parcelId, addressId, userId) => {
          callback2([parcelId, addressId, userId])
          return subObjectPromise(userId, 'user', [parcelId, addressId, userId])
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
      done()
    }
    const debounceCallback1 = debounce(callback1, 10)
    const registerCallback1 = data => {
      store1.push(data)
      debounceCallback1()
    }
    const store2 = []
    const callback2 = () => {
      const uniqAddresses = uniqWith(parcels.map(parcel => [parcel.id, parcel.address, 'user_02']), (a, b) => a[2] === b[2])
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
})
