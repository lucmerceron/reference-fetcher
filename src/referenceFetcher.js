import 'babel-polyfill'
import { isArray, isObject } from 'lodash'
import warning from './util/warning'

const rootFetchCalled = {}
const refsRetrieved = {}
let fetchSubRef = () => {}

const getEntity = (entity, id) => {
  if (refsRetrieved[entity] && refsRetrieved[entity][id]) return Object.assign({}, refsRetrieved[entity][id])
  return null
}

const registerNewEntity = (entity, id, value = true) => {
  if (!getEntity(entity, id)) refsRetrieved[entity] = Object.assign({}, refsRetrieved[entity], { [id]: value })
}

/*
* Function to retrieve a list of uniques ids from the parent relations
*/
const retrieveUniquesIds = (parent, relation, optional = false) =>
  parent.reduce((acc, object) => {
    const { [relation]: relationId } = object
    if (!relationId && !optional) {
      warning(`the relation ${relation} could not be found in object ${object.id}`, true)
    } else if (acc.indexOf(relationId) === -1 && typeof relationId !== 'undefined') {
      // Keep the list unique
      acc.push(relationId)
    }
    return acc
  }, [])

/*
* Function to retrieve the ids to fetch and the objects already fetched
*/
const crossIdsWithCache = (entity, ids, noCache) => {
  // If no cache, do not attempt to check the cache
  if (noCache) return { idsToFetch: ids, alreadyFetched: [] }

  // Check if already present in cache of not and create the resulting object
  return ids.reduce((acc, id) => {
    const inCache = getEntity(entity, id)
    if (inCache) acc.alreadyFetched.push(inCache)
    else acc.idsToFetch.push(id)
    return acc
  }, { idsToFetch: [], alreadyFetched: [] })
}

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
  const { fetch, entity, relationName, refs: subRefs, batch, noCache, optional } = ref
  // The name of the relation in the parent object
  const relation = relationName || entity
  // If the returned object is not an array,
  // transform it for generic usage
  if (!isArray(parentObject) && isObject(parentObject)) {
    parentObject = [parentObject]
  }

  // Retrieve the list of ids to fetch
  const uniqIds = retrieveUniquesIds(parentObject, relation, optional)

  // Filter the list of ids with what ids need to be fetch
  // and what objects has already been fetched
  const { idsToFetch, alreadyFetched } = crossIdsWithCache(entity, uniqIds, noCache)

  if (idsToFetch.length === 0) {
    // If we have nothing to fetch, just continue with underneath references
    if (subRefs) fetchSubRefs(subRefs, alreadyFetched)
  } else {
    // Else call the fetch function with the batch of ids or one by one
    const fetchEnhancedCall = () => {
      // If we want a batch, only one request is thrown
      if (batch) return fetch(idsToFetch)
      // Else we need to wait for each request response to go further
      else return Promise.all(idsToFetch.map(fetch))
    }
    fetchEnhancedCall().then(values => {
      // Register the new objects in our cache for future use
      if (values) values.forEach(value => registerNewEntity(entity, value.id, value))

      // Continue with underneath references with our fetched and cached values
      if (subRefs) fetchSubRefs(subRefs, [...values, ...alreadyFetched])
    }, reason => {
      warning(`the fetch for entity ${entity} returned an error: ${reason}`)
    })
  }
}

const fetchRefs = structure => {
  const { fetch, entity, refs: subRefs } = structure
  if (typeof fetch !== 'function') {
    warning(`the fetch of entity ${entity} is not a function`)
    return
  }
  // One way to identify surely, without assumption on the name, a function
  const funcSignature = fetch.toString()
  // funcResult is present if function already called
  const funcResult = rootFetchCalled[funcSignature]

  // If fetch already called
  if (funcResult) {
    if (subRefs && subRefs.length > 0) fetchSubRefs(subRefs, funcResult)
    return
  }

  if (subRefs && subRefs.length > 0) {
    // Get the result entity
    fetch().then(result => {
      // Verify if the entity attribute actually gave something to work on
      if (!result) {
        warning(`the entity ${entity} does not exist in object ${JSON.stringify(result, null, 2)}`)
        return
      }
      // Register our fetch result in order to avoid unecessary recall later one
      rootFetchCalled[funcSignature] = result
      // Fetch entities for each sub-references
      fetchSubRefs(subRefs, result)
    })
  } else {
    fetch()
  }
}

export default fetchRefs
