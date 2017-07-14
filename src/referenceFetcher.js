import { isArray, isObject } from 'lodash'

const refsRetrieved = {}
let fetchSubRef = () => {}

const entityAlreadyFetched = (entity, id) => refsRetrieved[entity] && refsRetrieved[entity][id]
const registerNewEntity = (entity, id) => (refsRetrieved[entity] = Object.assign({}, refsRetrieved[entity], { [id]: true }))

/*
* fetchSubRefs just loops on the refs array and calls fetchSubRef for each unique referenceId
*/
const fetchSubRefs = (subRefs, ...rest) => {
  const parentObject = rest.length > 1 ? rest[rest.length - 1] : []
  subRefs.forEach(ref => {
    const { entity: refEntity } = ref
    const refId = parentObject[refEntity]
    if (!entityAlreadyFetched(refEntity, refId)) {
      registerNewEntity(refEntity, refId)
      fetchSubRef(ref, ...rest)
    }
  })
}

/*
* Take a ref, the parentObject and priorIds (if existing) to fetch on the referenced entity.
* It will also go deeper if subRefs are presents
*/
fetchSubRef = (ref, ...rest) => {
  // Deconstruct the refs structure to retrieve the fetch promise, the entity to target and the sub structure if present
  const { func: fetch, entity, refs: subRefs } = ref
  // The parent object represent the last object fetched
  let parentObject = rest[rest.length - 1]
  // PriorIds is used to give to our fetch func the context as parameters (parcelId, addressId, userId) => ...
  const priorIds = rest.length > 1 ? rest.slice(0, rest.length - 1) : []

  // Prepare the fetch call
  let fetchEnhanced = (parentId, currentId) => fetch.apply(null, [...priorIds, parentId, currentId])

  // Fetch call for with recursiveness (sub-references)
  if (subRefs) {
    fetchEnhanced = (parentId, currentId) =>
      fetch.apply(null, [...priorIds, parentId, currentId]).then(({ [entity]: rootObject }) => {
        fetchSubRefs(subRefs, ...[...priorIds, parentId, rootObject])
      })
  }

  // If the parentObject is an object without being an Array
  // transform it so it is the computing as an array
  if (!isArray(parentObject) && isObject(parentObject)) {
    parentObject = [parentObject]
  } else if (!isArray(parentObject)) {
    console.warn('the promise action given to fetchRefs util is not returning the correct entity ', entity)
    return
  }

  // Launch the fetch for each uniq object
  parentObject.forEach(object => {
    const { id: parentId, [entity]: currentId } = object
    if (!entityAlreadyFetched(entity, currentId)) {
      registerNewEntity(entity, currentId)
      fetchEnhanced(parentId, currentId)
    }
  })
}

/*
* recursiveFetch is used to deep fetch data from the response of the API.
* It uses the reference of the result to further fetch the data.
* It is useful as it allows to keep stores flat by not asking for populated responses.
*
* Example structure of param:
* {
*   entity: 'parcels',
*   func: getParcels,
*   refs: [{
*     entity: 'collect',
*     func: (parcelId, collectId) => getParcelsCollect(parcelId, collectId),
*   }, {
*      entity: 'address',
*      func: (parcelId, addressId) => getParcelsAddress(parcelId, addressId),
*      refs: [{
*         entity: 'org',
*         func: (parcelId, addressId, orgId) => getParcelsAddressOrg(parcelId, addressId, orgId),
*      }]
*   }]
* }
*
* funcs given should be Promises
*/
const fetchRefs = structure => {
  // Deconstruct the refs structure to retrieve the fetch promise, the entity to target and the sub structure if present
  const { func: fetch, entity, refs: subRefs } = structure

  // Fetch the root result
  if (subRefs) {
    // Get the result entity
    fetch().then(({ [entity]: rootObject }) => {
      // Fetch entities for each sub-references
      fetchSubRefs(subRefs, rootObject)
    })
  } else {
    fetch()
  }
}

export default fetchRefs
