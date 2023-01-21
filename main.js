const { ipcMain, dialog, app, BrowserWindow, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const {encode} = require('html-entities')
const Store = require('electron-store')

const store = new Store()

// const g_ITEM_LIMIT = 5
const g_ITEM_LIMIT = 30

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

/*
    patに従うファイル名（0パディングの数字）を数字的に新しい順にsortした配列として返す。
*/
const readDirs = async(dirPath, pat) => {
    const dirs = await fs.readdir(dirPath)

    return await Promise.all(
        dirs
        .filter(fname => fname.match(pat))
        .filter( async fname => {
            const full = path.join(dirPath, fname)
            return (await fs.stat(full)).isDirectory()
        } )
        .sort( (a, b) => a < b ? 1 : -1)
        )
}

/*
  4桁の数字のdirを数字的にあたらしい順にsortした配列として返す。
*/
const readYears = async(dirPath) => {
    return await readDirs( dirPath, /^[0-9][0-9][0-9][0-9]$/)
}

/*
  2桁の数字のdirを数字的に新しい順にsortした配列として返す
*/
const readMonths = async(dirPath, yearstr) => {
    const targetDir = path.join(dirPath, yearstr)
    return await readDirs( targetDir, /^[0-9][0-9]$/)
} 

const readDays = async(dirPath, yearstr, monthstr) => {
    const targetDir = path.join(dirPath, yearstr, monthstr)
    return await readDirs( targetDir, /^[0-9][0-9]$/)
}

const readFilePathsAt = async(dirPath, yearstr, monthstr, daystr) => {
    const targetPath = path.join(dirPath, yearstr, monthstr, daystr)
    const files = await fs.readdir(targetPath)
    return files
        .filter( fname => fname.match(/^[0-9]+\.txt$/) )
        .sort( (a, b) => a < b ? 1 : -1)
        .map(fname => { return {fullPath: path.join(targetPath, fname), fname: fname} })
}

const readFilePaths = async(dirPath, count) => {
    const years = await readYears(dirPath)
    let ret = []
    for (const year of years) {
        const months = await readMonths(dirPath, year)
        for (const month of months) {
            const days = await readDays(dirPath, year, month)
            for (const day of days) {
                const cur = await readFilePathsAt(dirPath, year, month, day)
                ret = ret.concat(cur)
                if (ret.length > count)
                    return ret
            }
        }
    }
    return ret
}

const loadDir = async (dirPath, sender) => {
    const paths = await readFilePaths(dirPath, g_ITEM_LIMIT)
    paths.reverse()
    let contents = await Promise.all(
        paths
        .map( async pathpair => {
            const date = new Date(parseInt(pathpair.fname.substring(0, pathpair.fname.length - 4)))
            const content = await fs.readFile(pathpair.fullPath)
            return {fullPath: pathpair.fullPath, date: date, content: content}
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

const zeroPad = (num) => {
    if (num >= 10)
        return num.toString()
    return "0" + num.toString()
}

const ensureDir = async (dir) => {
    try {
        await fs.access( dir, fs.constants.R_OK | fs.constants.W_OK )
    }
    catch(error) {
        await fs.mkdir( dir, { recursive: true } )
    }
}

const saveContent = async (dt, text)=>{
    const targetDir = path.join(store.get('root-path'), dt.getFullYear().toString(), zeroPad(dt.getMonth()+1), zeroPad(dt.getDate()))
    await ensureDir(targetDir)

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

