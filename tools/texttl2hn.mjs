#!/usr/bin/env node

/*
  TextTLのルートのdirを渡すと、htmnixに食わせるhtml片を返す。
  以下のように使います。

   ./texttl2hn.mjs  ~/mydir/TextTL/ | htmnix
*/


if (process.argv.length != 3) {
    console.log("Usage: texttl2hn <texttl_dir>")
    console.log(process.argv.length)
    process.exit(1)
}

const dirpath = process.argv[2]

/*
  main.jsから適当にコピペ
*/
import path from 'path'
import fs from 'fs/promises'


const g_ITEM_LIMIT = 30


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

/*
  htmnixのblock2hn.jsから適当にコピペ。
*/

class Paragraph {
    constructor(fullPath, date, content) {
        this.fullPath = fullPath
        this.date = date
        this.content = content
    }
}

const dtoption = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // 24時間表示に強制
  hourCycle: 'h23', 
  // timeZone: 'Asia/Tokyo' 
}

const formatter = new Intl.DateTimeFormat('ja-JP', dtoption)

const dt2text = (dt) => {
    return formatter.format(dt).replace(/\s/, ' ') // 一部の環境で区切り文字が ' ' 以外になるのを防ぐため置換
}
/*
const date = new Date();


// 'ja-JP'ロケールは日付と時刻を「/」と「:」で区切る形式をデフォルトで採用します。
const formatter = new Intl.DateTimeFormat('ja-JP', options);

// 出力: 2025/10/15 12:36:25 (※実際の時刻が出力されます)
const output = formatter.format(date).replace(/\s/, ' '); // 一部の環境で区切り文字が ' ' 以外になるのを防ぐため置換

console.log(output);
*/

// <div class="hn-multi-sel box" hn-value="/my/path/TextTL/2025/10/14/1760422791829.txt">Hello</div>
const para2html = (para) => {
    const dttext = dt2text(para.date)
    return `<div class="hn-multi-sel box" hn-value="${para.fullPath}">
             ${para.content}<br><br>
              ${dttext}
            </div>`
}

const paras2html = (paras) => {
    return paras.map( p => para2html(p) ).join("\n")
}


const dir2paras = async (dirPath) => {
    const paths = await readFilePaths(dirPath, g_ITEM_LIMIT)
    const limited = paths.length <= g_ITEM_LIMIT ? paths : paths.slice(0, g_ITEM_LIMIT)
    return await Promise.all(
        limited
        .map( async pathpair => {
            const date = new Date(parseInt(pathpair.fname.substring(0, pathpair.fname.length - 4)))
            const content = await fs.readFile(pathpair.fullPath, { encoding: "utf8" })
            const cont2html = content.split('\n').join('<br>\n')
           return new Paragraph(pathpair.fullPath, date, cont2html)
        })
    )
}


const paras = await dir2paras(dirpath)
const parahtml = paras2html(paras)
console.log(`<div class="buttons level-right">
<button class="button hn-cancel">Cancel</button>
<button class="button hn-submit">Publish</button>
</div>
`)
console.log(parahtml)
