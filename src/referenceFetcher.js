import { isArray, isObject } from 'lodash'
import warning from './util/warning'

const refsRetrieved = {}
let fetchSubRef = () => {}

const entityAlreadyFetched = (entity, id) => refsRetrieved[entity] && refsRetrieved[entity][id]
const registerNewEntity = (entity, id) =>
  (refsRetrieved[entity] = Object.assign({}, refsRetrieved[entity], { [id]: true }))

/*
* fetchSubRefs just loops on the refs array and calls fetchSubRef for each unique referenceId
*/
const fetchSubRefs = (subRefs, parentObject) => {
  subRefs.forEach(ref => {
    fetchSubRef(ref, parentObject)
  })
}

/*
* Take a ref, the parentObject and priorIds (if existing) to fetch on the referenced entity.
* It will also go deeper if subRefs are presents
*/
fetchSubRef = (ref, parentObject) => {
  // Deconstruct the refs structure to retrieve the fetch promise, the entity to target and the sub structure if present
  const { func: fetch, entity, refs: subRefs, batch, noCache, relationName } = ref
  // The name of the relation in the parent object
  const relation = relationName || entity

  // Prepare the fetch call
  let fetchEnhanced = currentId => fetch(currentId)

  // Fetch call for with recursiveness (sub-references)
  if (subRefs) {
    fetchEnhanced = currentId =>
      fetch(currentId).then(({ [entity]: rootObject }) => {
        fetchSubRefs(subRefs, rootObject)
      })
  }

  // If the parentObject is an object without being an Array
  // transform it so it is the computing as an array
  if (!isArray(parentObject) && isObject(parentObject)) {
    parentObject = [parentObject]
  } else if (!isArray(parentObject)) {
    warning(`the promise action given to referenceFetcher is not returning the correct entity ${relation}`)
    return
  }

  // If batch is set to true, we need to give the array of ids directly to fetchEnhanced
  if (batch) {
    const entityIds = []
    // Launch the fetch for each uniq object
    parentObject.forEach(object => {
      const { [relation]: currentId } = object
      if (!currentId) {
        warning(`the relation ${relation} could not be found in object ${object.id}`)
        return
      }
      if (!entityAlreadyFetched(relation, currentId)) {
        registerNewEntity(relation, currentId)
        entityIds.push(currentId)
      } else if (noCache) {
        entityIds.push(currentId)
      }
    })
    fetchEnhanced(entityIds)
  } else {
    // Launch the fetch for each uniq object
    parentObject.forEach(object => {
      const { [relation]: currentId } = object
      if (!currentId) {
        warning(`the relation ${relation} could not be found in object ${object.id}`)
        return
      }
      if (!entityAlreadyFetched(relation, currentId)) {
        registerNewEntity(relation, currentId)
        fetchEnhanced(currentId)
      } else if (noCache) {
        fetchEnhanced(currentId)
      }
    })
  }
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
  const { func, entity, refs: subRefs } = structure
  if (typeof func !== 'function') {
    warning(`the func of entity ${entity} is not a function`)
    return
  }

  // Fetch the root result
  if (subRefs && subRefs.length > 0) {
    // Get the result entity
    func().then(({ [entity]: rootObject }) => {
      // Fetch entities for each sub-references
      fetchSubRefs(subRefs, rootObject)
    })
  } else {
    func()
  }
}

export default fetchRefs
