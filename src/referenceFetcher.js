import 'babel-polyfill'
import { isArray, isObject } from 'lodash'
import warning from './util/warning'


const refsRetrieved = {}
let fetchSubRef = () => {}

const getEntity = (entity, id) => {
  if (refsRetrieved[entity] && refsRetrieved[entity][id]) return refsRetrieved[entity][id]
  return null
}
const registerNewEntity = (entity, id, value = true) => {
  if (!getEntity(entity, id)) refsRetrieved[entity] = Object.assign({}, refsRetrieved[entity], { [id]: value })
}

/*
* enhanceFetch enhance the fetch function with cache management
* Returns a function taking id to fetch.
*/
const enhanceFetch = (fetch, relation, entity, noCache) => id => {
  const entityAlreadyFetched = getEntity(relation, id)
  // The noCache is used to ask for a fetch call even if entity is
  // already fetched, but does not avoid registering the entity
  if (!entityAlreadyFetched || noCache) {
    return fetch(id).then(({ [entity]: rootObject }) => {
      // Transform the object to array for generic usage
      if (!isArray(rootObject) && isObject(rootObject)) {
        rootObject = [rootObject]
      }
      // Register each fetched entities for future usage
      rootObject.forEach(object => registerNewEntity(entity, object.id, object))

      // Return the rootObject for promise all
      return rootObject
    })
  } else {
    return entityAlreadyFetched
  }
}

/*
* Function to retrieve a list of uniques ids from the parent relations
*/
const retrieveIdsToFetch = (parent, relation) =>
  parent.reduce((acc, object) => {
    const { [relation]: relationId } = object
    if (!relationId) {
      warning(`the relation ${relation} could not be found in object ${object.id}`)
    } else if (acc.indexOf(relationId) === -1) {
      // Keep the list unique
      acc.push(relationId)
    }
    return acc
  }, [])

/*
* fetchSubRefs simply loops on the subRefs array and calls fetchSubRef
*/
const fetchSubRefs = (subRefs, parentObject) => {
  subRefs.forEach(ref => {
    fetchSubRef(ref, parentObject)
  })
}

/*
* Take the ref and the parentObject to fetch on the referenced entity.
* Will also fetch subRefs if presents
*/
fetchSubRef = (ref, parentObject) => {
  // Deconstruct the refs structure to retrieve the fetch promise, the entity to target and the sub structure if present
  const { fetch, entity, relationName, refs: subRefs, batch, noCache } = ref
  // The name of the relation in the parent object
  const relation = relationName || entity
  // If the returned object is not an array,
  // transform it for generic usage
  if (!isArray(parentObject) && isObject(parentObject)) {
    parentObject = [parentObject]
  }

  // Enhance the fetch call with cache management
  const fetchEnhanced = enhanceFetch(fetch, relation, entity, noCache)

  // Retrieve the list of ids to fetch
  const idsToFetch = retrieveIdsToFetch(parentObject, relation)

  // Fetch should be called as a batch or not
  const fetchEnhancedCall = () => {
    if (batch) return fetchEnhanced(idsToFetch)
    else return idsToFetch.map(fetchEnhanced)
  }

  // The user wants to batch call or enjoy HTTP2 parallelization speed
  Promise.all(fetchEnhancedCall()).then(values => {
    if (subRefs) fetchSubRefs(subRefs, ...values)
  }, reason => {
    warning(`the fetch for entity ${entity} returned an error: ${reason}`)
  })
}

const fetchRefs = structure => {
  const { fetch, entity, refs: subRefs } = structure
  if (typeof fetch !== 'function') {
    warning(`the fetch of entity ${entity} is not a function`)
    return
  }

  // Fetch the root result
  if (subRefs && subRefs.length > 0) {
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
