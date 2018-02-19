// import 'babel-polyfill'
import { isArray, isObject, findIndex } from 'lodash'
import warning from './util/warning'

const rootFetchCalled = {}
const refsRetrieved = {}
const idsFailed = []
let fetchSubRef = () => {}
let fetchEnhanced = () => {}

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
    } else if (acc.indexOf(relationId) === -1 && relationId != null) {
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

  // Check if already present in cache or in failed ids and create the resulting object
  return ids.reduce((acc, id) => {
    const inCache = getEntity(entity, id)
    if (inCache) acc.alreadyFetched.push(inCache)
    else if (idsFailed.indexOf(id) === -1) acc.idsToFetch.push(id)
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

const fetchSides = (sides, result) => {
  // Call side if present with the result
  if (sides && isArray(sides)) {
    sides.forEach(side => {
      if (typeof side.fetch !== 'function') {
        warning(`the side fetch for entity ${side.entity} is not a function`)
      } else {
        // Uniq ids of parent to fetch
        const uniqIds = result.map(res => res.id)
        // Filter the list of ids with what ids need to be fetch
        // and what objects has already been fetched
        const { idsToFetch } = crossIdsWithCache(side.entity, uniqIds)

        if (idsToFetch.length > 0) {
          side.fetch(idsToFetch).then(values => {
            // If the fetch did not returned values, warn the client
            if (!values) warning(`the side fetch for entity ${side.entity} returned no result`)

            // Register the new objects in our cache for future use
            if (values && isArray(values)) values.forEach(value => registerNewEntity(side.entity, value.id, value))

            // Search for and register ids that wasn't retrieved
            idsToFetch.forEach(id => {
              if (findIndex(values, { id }) === -1 && idsFailed.indexOf(id) === -1) idsFailed.push(id)
            })
          }, reason => {
            warning(`the side fetch for entity ${side.entity} returned an error: ${reason}`)
          })
        }
      }
    })
  }
}

/*
* Wrap the fetch function with checks and
* call fetchSides if needed
*/
fetchEnhanced = (fetch, entity, sides, alreadyFetched) => new Promise((resolve, reject) => {
  const alreadyFetchedCopy = alreadyFetched ? [...alreadyFetched] : []

  fetch().then(result => {
    // Verify if the entity attribute actually gave something to work on
    if (!result) {
      warning(`the fetch for entity ${entity} returned no result`)
      resolve(null)
    }

    const funcSignature = fetch.toString()
    // Register our fetch result in order to avoid unecessary recall later one
    rootFetchCalled[funcSignature] = result

    // Fetch sides if present
    fetchSides(sides, [...result, ...alreadyFetchedCopy])

    resolve(result)
  }).catch(reason => {
    warning(`the fetch for entity ${entity} returned an error: ${reason}`)
    reject(reason)
  })
})

/*
* Take the ref and the parentObject to fetch on the referenced entity.
* Will also fetch subRefs if presents
*/
fetchSubRef = (ref, parentObject) => {
  // Deconstruct the refs structure to retrieve the fetch promise, the entity to target and the sub structure if present
  const { fetch, entity, relationName, refs: subRefs, batch, noCache, optional, sides } = ref
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
    if (subRefs && subRefs.length > 0) fetchSubRefs(subRefs, alreadyFetched)
    // Fetch sides if present
    fetchSides(sides, alreadyFetched)
  } else {
    // Else call the fetch function with the batch of ids or one by one
    const fetchEnhancedCall = () => {
      // If we want a batch, only one request is thrown
      if (batch) return fetch(idsToFetch)
      // Else we need to wait for each request response to go further
      else return Promise.all(idsToFetch.map(fetch))
    }
    Promise.resolve(fetchEnhanced(fetchEnhancedCall, entity, sides, alreadyFetched)).then(values => {
      // If the fetch did not returned values, warn the client
      if (!values) warning(`the fetch for entity ${entity} returned no values`)

      // Register the new objects in our cache for future use
      if (values && isArray(values)) values.forEach(value => registerNewEntity(entity, value.id, value))

      // Search for and register ids that wasn't retrieved
      idsToFetch.forEach(id => {
        if (findIndex(values, { id }) === -1 && idsFailed.indexOf(id) === -1) idsFailed.push(id)
      })

      // Continue with underneath references with our fetched and cached values
      if (values && subRefs) fetchSubRefs(subRefs, [...values, ...alreadyFetched])
    })
  }
}

const fetchRefs = structure => {
  const { fetch, entity, refs: subRefs, rootNoCache = false, sides } = structure
  if (typeof fetch !== 'function') {
    warning(`the fetch of entity ${entity} is not a function`)
    return
  }

  // One way to identify surely, without assumption on the name, a function
  const funcSignature = fetch.toString()

  // funcResult is present if function already called
  const funcResult = rootFetchCalled[funcSignature]

  // If fetch already called
  if (funcResult && !rootNoCache) {
    if (subRefs && subRefs.length > 0) fetchSubRefs(subRefs, funcResult)
    // Fetch sides if present
    fetchSides(sides, funcResult)
    return
  }


  if (subRefs && subRefs.length > 0) {
    // Get the result entity
    fetchEnhanced(fetch, entity, sides).then(result => fetchSubRefs(subRefs, result))
  } else {
    fetchEnhanced(fetch, entity, sides)
  }
}

export default fetchRefs
