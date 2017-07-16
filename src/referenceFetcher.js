import { isArray, isObject } from 'lodash'
import warning from './util/warning'

const refsRetrieved = {}
let fetchSubRef = () => {}

const registerNewEntity = (entity, id) => {
  if (refsRetrieved[entity] && refsRetrieved[entity][id]) return false
  refsRetrieved[entity] = Object.assign({}, refsRetrieved[entity], { [id]: true })
  return true
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
  const { fetch, entity, relationName, refs: subRefs, batch, noCache } = ref
  // The name of the relation in the parent object
  const relation = relationName || entity

  // Prepare the fetch call
  let fetchEnhanced = currentId => fetch(currentId)
  // Fetch call with recursiveness for underneath references
  if (subRefs) {
    fetchEnhanced = currentId =>
      fetch(currentId).then(({ [entity]: rootObject }) => {
        fetchSubRefs(subRefs, rootObject)
      })
  }

  // If the parentObject is not an array,
  // transform it for generic usage
  if (!isArray(parentObject) && isObject(parentObject)) {
    parentObject = [parentObject]
  }

  const idsToFetch = []
  // Retrieve the ids to fetch
  parentObject.forEach(object => {
    const { [relation]: currentId } = object
    if (!currentId) {
      warning(`the relation ${relation} could not be found in object ${object.id}`)
      return
    }
    // The noCache is used to ask for a fetch call even if entity id
    // already fetched, but does not avoid registering the entity
    if (registerNewEntity(relation, currentId) || noCache) {
      idsToFetch.push(currentId)
    }
  })

  // We want the batch call or enjoy HTTP2 lightning speed
  if (batch) fetchEnhanced(idsToFetch)
  else idsToFetch.forEach(id => fetchEnhanced(id))
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
