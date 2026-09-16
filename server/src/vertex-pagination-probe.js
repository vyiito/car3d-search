const UA = 'VJ3DSearch pagination probe'
const ACTION_ID = 'c908a748621d476569fea162fbb64dc08ca0fe78'

export async function probeVertexPagination() {
  const url = 'https://www.vertex-warehouse.com/search?query=Toyota%20Supra&type=fts'
  const bodies = [
    { type: 'text/plain;charset=UTF-8', body: JSON.stringify(['Toyota Supra', { page: 2, itemsPerPage: 11 }]) },
    { type: 'application/json', body: JSON.stringify(['Toyota Supra', { page: 2, itemsPerPage: 11 }]) },
  ]
  for (const variant of bodies) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          accept: 'text/x-component',
          'content-type': variant.type,
          'next-action': ACTION_ID,
          origin: 'https://www.vertex-warehouse.com',
          referer: url,
        },
        body: variant.body,
      })
      const text = await response.text()
      console.log(`[vertex-action-call] type=${variant.type} status=${response.status} ct=${response.headers.get('content-type')} bytes=${text.length} sample=${text.slice(0,3500).replace(/\s+/g,' ')}`)
    } catch (error) {
      console.log(`[vertex-action-call] ERROR type=${variant.type} ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
