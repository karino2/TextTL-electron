const {ipcRenderer} = require('electron')


window.addEventListener('DOMContentLoaded', () => {
    const contentRootDiv = document.getElementById('content-root')

    ipcRenderer.on('update-content', (event, html, scroll) => {
        contentRootDiv.innerHTML = html
        if (scroll)
        {
            window.setTimeout(()=>{
                window.scrollTo(0, document.body.scrollHeight)
            },
            500)

        }
    })

    const postDiv = document.getElementById("post-div")
    const postArea = postDiv.querySelector("#post-area")
    
    const postEdit = () => {
        ipcRenderer.send('post', postArea.value)
    }

    document.getElementById('submit-post').addEventListener('click', postEdit)
    postArea.addEventListener('keydown', (event)=>{
        if((event.keyCode == 10 || event.keyCode == 13)
            && (event.ctrlKey || event.metaKey)) {
            postEdit()        
        }
    })

    ipcRenderer.on('clear-post', ()=>{
        postArea.value = ""
    })  
  
})