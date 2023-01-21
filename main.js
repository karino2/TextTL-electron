const { ipcMain, dialog, app, BrowserWindow, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const {encode} = require('html-entities')
const Store = require('electron-store')

const store = new Store()

// そのうち消す
let g_srcLines = [];
let g_currentPath = '';


const createWindow = async () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const win = new BrowserWindow({
      width: width,
      height: height,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      }
    })
  
    win.loadFile('index.html')

    const rootPath = store.get('root-path')
    if (rootPath == null) {
        await openDirDialog((dir)=>{
            loadDir(dir, win)
        })
    }
    else
    {
        await loadDir(rootPath, win)
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

let g_contents = [
];

const loadDir = async (dirPath, sender) => {
    // TODO:
    // const files = await fs.readdir(dirPath)
    const targetDir = path.join(dirPath, "2023", "01", "21")
    const files = await fs.readdir(targetDir)
    let contents = await Promise.all(
        files
        .filter( fname => fname.endsWith(".txt"))
        .map( async fname => {
            const full = path.join(targetDir, fname)
            const date = new Date(parseInt(fname.substring(0, fname.length - 4)))
            const content = await fs.readFile(full)
            return {fullPath: full, date: date, content: content}
        })
    )
    g_contents = contents;

    updateText(contents, sender, true)
}


const openDirDialog = async (onSuccess) => {
    const {canceled, filePaths} = await dialog.showOpenDialog({
        properties: ['openDirectory'],
    })
    if(!canceled) {
        store.set('root-path', filePaths[0])
        onSuccess(filePaths[0])
    }
}
const reloadDir = async (target) => {
    loadDir(store.get('root-path'), target)
}


const para2html = (json) => {
    let encoded = encode(json.content)
    let dtstr = json.date.getTime().toString()

    return `<div class="box" dt="${dtstr}">
              ${encoded}
              <div class="content is-small">${json.date}</div>
            </div>`
}

const contents2html = (contents) => {
    return contents.map( p => para2html(p) ).join("\n")
}

const updateText = (contents, targetWin, scroll) => {
    const html = contents2html(contents)
    targetWin.send('update-content', html, scroll)
}

ipcMain.on('box-click', async (event, start, end)=> {
    // NYI
    const src = g_srcLines.slice(start, end).join("\n")
    event.sender.send('start-edit', src, start, end)
})
ipcMain.on('submit', async (event, text, [start, end])=>{
    // NYI
    const prev = g_srcLines
    g_srcLines = []
    for( let i = 0; i < start; i++) {
        g_srcLines[i] = prev[i]
    }
    text.split('\n').forEach(line => g_srcLines.push(line))
    for(let i = end; i < prev.length; i++) {
        g_srcLines.push(prev[i])
    }
    const src = g_srcLines.join('\n')
    await fs.writeFile(g_currentPath, src)
    updateText(g_srcLines, event.sender, false)
})

const zeroPad = (num) => {
    if (num >= 10)
        return num.toString()
    return "0" + num.toString()
}

const ensureDir = async (dir) => {
    try {
        await fs.access( dir, constants.O_RDWR )
    }
    catch {
        await fs.mkdir( dir )
    }
}

const saveContent = async (dt, text)=>{
    const targetDir = path.join(store.get('root-path'), dt.getFullYear().toString(), zeroPad(dt.getMonth()+1), zeroPad(dt.getDate()))
    ensureDir(targetDir)

    const fname = dt.getTime().toString() + ".txt"
    const full = path.join(targetDir, fname)
    await fs.writeFile(full, text)
    return full
}

ipcMain.on('post', async (event, text)=> {
    const now = new Date()
    const full = await saveContent(now, text)
    const oneCont = {fullPath: full, date: now, content: text}
    g_contents.push( oneCont )
    updateText(g_contents, event.sender, true)

    event.sender.send('clear-post')
})

const isMac = process.platform === 'darwin'

const template = [
  ...(isMac ? [{ role: 'appMenu'}] : []),
  {
    label: 'File',
    submenu: [
        {
            label: "Open Root Dir",
            accelerator: 'CmdOrCtrl+O',
            click: async (item, focusedWindow)=> {
                openDirDialog((dir)=>{ loadDir(dir, focusedWindow) })
            }
        },
        isMac ? { role: 'close' } : { role: 'quit' }
    ]
  },
  { role: 'editMenu' },
  {
    label: 'View',
    submenu: [
      {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: (item, focusedWindow)=> {
              reloadDir( focusedWindow )
          }
      },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  { role: 'windowMenu' },
  {
    label: 'Developer',
    submenu: [
        { role: 'toggleDevTools' }
    ]
  }
]

app.whenReady().then(async () => {
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)

    await createWindow()

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow()
        }
    })
})

