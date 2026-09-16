const UA='VJ3DSearch/1.1 (+https://github.com/vyiito/car3d-search)'

async function probe(name,url){
  try{
    const response=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,accept:'application/json,text/html,*/*'}})
    const text=await response.text()
    const snippet=text.replace(/\s+/g,' ').slice(0,900)
    console.log(`[api-probe] ${name} status=${response.status} ct=${response.headers.get('content-type')||''} final=${response.url} bytes=${text.length} snippet=${snippet}`)
  }catch(error){console.log(`[api-probe] ${name} ERROR ${error instanceof Error?error.message:String(error)}`)}
}

export async function probeProviderStructures(){
  const tests=[
    ['done3d-wp-search','https://done3d.com/wp-json/wp/v2/search?search=Toyota%20Supra&per_page=10'],
    ['done3d-wp-posts','https://done3d.com/wp-json/wp/v2/posts?search=Toyota%20Supra&per_page=10&_embed=1'],
    ['brasil-wp-search','https://brasilsimulatormods.com/wp-json/wp/v2/search?search=Toyota%20Supra&per_page=10'],
    ['brasil-wp-posts','https://brasilsimulatormods.com/wp-json/wp/v2/posts?search=Toyota%20Supra&per_page=10&_embed=1'],
    ['3drush-wp-search','https://3drush.com/wp-json/wp/v2/search?search=Toyota%20Supra&per_page=10'],
    ['3drush-wp-posts','https://3drush.com/wp-json/wp/v2/posts?search=Toyota%20Supra&per_page=10&_embed=1'],
    ['3dsky-api-search','https://3dsky.org/api/models?search=Toyota%20Supra&page=1'],
    ['3dsky-api-query','https://3dsky.org/api/models?query=Toyota%20Supra&page=1'],
    ['3dsky-api-q','https://3dsky.org/api/models?q=Toyota%20Supra&page=1'],
    ['vosan-page','https://vosan.co/explore?search=Toyota%20Supra'],
    ['3dwarehouse-page','https://3dwarehouse.sketchup.com/search/?q=Toyota%20Supra%20car%20vehicle'],
  ]
  for(const [name,url] of tests) await probe(name,url)
}
