const { ipcMain, dialog, app, BrowserWindow, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const {encode} = require('html-entities')
const Store = require('electron-store')
const dateFormat = require('dateformat')

const store = new Store()

let g_srcLines = [];
let g_currentPath = '';


function createWindow () {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const win = new BrowserWindow({
      width: width,
      height: height,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      }
    })
  
    win.loadFile('index.html')
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

const openPath = async (filePath, sender) => {
    app.addRecentDocument(filePath)
    g_currentPath = filePath
    store.set('last-path', filePath)
    const cont = await fs.readFile( filePath )
    g_srcLines = cont.toString().split('\n')
    updateText(g_srcLines, sender, true)
}


const openFileDialog = async (targetWin) => {
    const {canceled, filePaths} = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if(!canceled) {
        openPath( filePaths[0], targetWin )
    }
}
const reloadFile = (target) => {
    if (g_currentPath != "")
        openPath(g_currentPath, target)
}

class Paragraph {
    constructor(begin, end, text) {
        this.begin = begin
        this.end = end
        this.text = text
    }
}

const linesToParas = (lines) => {
    let begin = 0
    let paras = []
    let curlines = []
    for( let [idx, line] of lines.entries())
    {
        if (line == "")
        {
            paras.push( new Paragraph(begin, idx, curlines.join('<br>\n')))
            begin = idx+1
            curlines = []
        }
        else
        {
            curlines.push(encode(line))
        }
    }
    if (curlines.length != 0)
    {
        paras.push( new Paragraph(begin, lines.length, curlines.join('<br>\n')))
    }

    return paras
}

const para2html = (para) => {
    return `<div src-line-start=${para.begin} src-line-end=${para.end} class="box">
              ${para.text}
            </div>`
}

const paras2html = (paras) => {
    return paras.map( p => para2html(p) ).join("\n")
}

const updateText = (lines, targetWin, scroll) => {
    const paras = linesToParas(lines)
    const html = paras2html(paras)
    targetWin.send('update-content', html, scroll)
}

const g_pendingFile = []
if (store.get('last-path') != null)
{
    g_pendingFile.push(store.get('last-path'))
}
// g_pendingFile.push("/Users/arinokazuma/Google ドライブ/DriveText/memo2.txt")

const handleOpenFile = (path) => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
    let target = BrowserWindow.getFocusedWindow()
    if (target == null)
        target = BrowserWindow.getAllWindows()[0]
    openPath(path, target)
}

app.on('open-file', (event, path)=> {
    if(path.endsWith(".txt")) {
        event.preventDefault()
        if (!app.isReady())
        {
            g_pendingFile.push(path)
            return
        }
        handleOpenFile(path)
    }
})

ipcMain.on('box-click', async (event, start, end)=> {
    const src = g_srcLines.slice(start, end).join("\n")
    event.sender.send('start-edit', src, start, end)
})
ipcMain.on('submit', async (event, text, [start, end])=>{
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

ipcMain.on('post', async (event, text)=> {
    const now = new Date()
    const dtline = dateFormat(now, 'yyyy-mm-dd HH:MM')
    if(g_srcLines.length > 1 && g_srcLines[g_srcLines.length-1] != "") {
        g_srcLines.push("")
    }
    g_srcLines.push(dtline)
    g_srcLines.push(text)

    const src = g_srcLines.join('\n')
    await fs.writeFile(g_currentPath, src)
    updateText(g_srcLines, event.sender, true)
    event.sender.send('clear-post')
})

const isMac = process.platform === 'darwin'

const template = [
  ...(isMac ? [{ role: 'appMenu'}] : []),
  {
    label: 'File',
    submenu: [
        {
            label: "Open",
            accelerator: 'CmdOrCtrl+O',
            click: async (item, focusedWindow)=> {
                openFileDialog(focusedWindow)
            }
        },
        {
            label: "Open Recent",
            role: "recentDocuments",
            submenu: [
                {
                    label: "Clear Recent",
                    role: "clearRecentDocuments"
                }
            ]
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
              reloadFile( focusedWindow )
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

app.whenReady().then(() => {
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)

    createWindow()

    if (g_pendingFile.length != 0)
    {
        handleOpenFile(g_pendingFile[0])
        g_pendingFile.length = 0
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

