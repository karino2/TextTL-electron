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

    let lastSelected = null
    let targetRange = [0, 0]

    const onBodyClick = (event) => {
        const findTargetElem = (start) => {
            if (start.tagName == "body")
                return null
            if (start == contentRootDiv)
                return null
            let cur = start
            while (cur != contentRootDiv) {
                let sline = cur.getAttribute('src-line-start')
                if (sline != null)
                    return cur
                cur = cur.parentElement
            
                // not contentRootDiv child
                if (cur == null)
                    return null
            }
            return null
        }

        let topelem = findTargetElem(event.target) 
        if (!topelem)
            return
        const sline_start = topelem.getAttribute('src-line-start')
        const sline_end = topelem.getAttribute('src-line-end')
        lastSelected = topelem
        ipcRenderer.send("box-click", parseInt(sline_start), parseInt(sline_end))
    }

    const body = document.getElementById("body")
    body.addEventListener('click', onBodyClick)
  
    const editDiv = document.getElementById("edit-div")
    const editArea = editDiv.querySelector("#edit-area")
  
    ipcRenderer.on('start-edit', (event, text, start, end) => {
        targetRange = [start, end]
        lastSelected.insertAdjacentElement('afterend', editDiv)
        editArea.value = text
        editArea.rows = Math.max((end-start), 3);
        editDiv.style.display = 'block'
    })

    document.getElementById('cancel-edit').addEventListener('click', ()=>{
        editDiv.style.display = 'none'
    })
    
    const submitEdit = ()=> {
        ipcRenderer.send('submit', editArea.value, targetRange)
        editDiv.style.display = 'none'
    }
    
    document.getElementById('submit-edit').addEventListener('click', ()=>{
        submitEdit()
    })
    
    editArea.addEventListener('keydown', (event)=>{
        if((event.keyCode == 10 || event.keyCode == 13)
            && (event.ctrlKey || event.metaKey)) {
            submitEdit()        
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