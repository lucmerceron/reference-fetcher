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
* fetchSubRefs just loops on the refs array and calls fetchSubRef for each unique referenceId
*/
const fetchSubRefs = (subRefs, parentObject) => {
  subRefs.forEach(ref => {
    fetchSubRef(ref, parentObject)
  })
}

/*
* Take a ref and the parentObject to fetch on the referenced entity.
* It will also go deeper if subRefs are presents
*/
fetchSubRef = (ref, parentObject) => {
  // Deconstruct the refs structure to retrieve the fetch promise, the entity to target and the sub structure if present
  const { func: fetch, entity, refs: subRefs, batch, noCache, relationName } = ref
  // The name of the relation in the parent object
  const relation = relationName || entity

  // Prepare the fetch call
  let fetchEnhanced = currentId => fetch(currentId)
  // Fetch call for with recursiveness (underneath references)
  if (subRefs) {
    fetchEnhanced = currentId =>
      fetch(currentId).then(({ [entity]: rootObject }) => {
        fetchSubRefs(subRefs, rootObject)
      })
  }

  // If the parentObject is an object without being an Array
  // transform it so it is computed as an array
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
    if (registerNewEntity(relation, currentId) || noCache) {
      idsToFetch.push(currentId)
    }
  })
  // If batch is set to true, we need to give the array of ids directly to fetchEnhanced
  if (batch) fetchEnhanced(idsToFetch)
  else idsToFetch.forEach(id => fetchEnhanced(id))
}

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
