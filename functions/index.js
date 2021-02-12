
/**
 * author: yenche123
 * createdAt: 2020/02/07
 */

 
const functions = require("firebase-functions")
const admin = require('firebase-admin')
admin.initializeApp()
const req = require("request")

// LINE的持久 TOKEN
const LINE_TOKEN = "你的LINE CHANNEL ACCESS TOKEN"
//請至 LINE CONSOLE 開發者平台獲取

exports.addTemplate = functions.https.onRequest(async (req, res) => {
  let ying = -1  //請輸入 營
  let lian = -1 //請輸入 連
  let tempMsg = 
`★★★前置模板★★★

`

  let class1 = "1-14"
  let class2 = "15-28"
  let class3 = ""
  let class4 = ""
  let class5 = ""
  let class6 = ""
  let class7 = ""
  let class8 = ""
  let class9 = ""
  let class10 = ""
  let class11 = ""
  let class12 = "" 

  let uploadData = {
    ying, lian, tempMsg,
    class1, class2, class3,
    class4, class5, class6, class7, class8,
    class9, class10, class11, class12
  }

  const db = admin.firestore()
  const collection = db.collection("J6_Lian")
  let q = collection.where("ying", "==", ying)
  q = q.where("lian", "==", lian)
  let snapshot = await q.get()
  if(snapshot.empty) {
    let q2Res = await collection.add(uploadData)
    res.json({result: `LianData with ID: ${q2Res.id} added.`})
  }
  else {
    let docId = snapshot.docs[0].id
    let q3Res = await collection.doc(docId).set(uploadData, { merge: true })
    res.json({result: "從已存在的文檔中 更新"})
  }

})


/************************* 入口函式 ****************************/
// 使用req.headers 可以獲取頭訊息
// 盡量使用 functions.logger.log 打印消息 因為其才能完整顯示Object
exports.msgFromLine = functions.https.onRequest(async (req, res) => {
  functions.logger.log("########## 歡迎調用 msgFromLine ##########")
  let body = req.body
  if(typeof body == "string") body = JSON.parse(body)
  functions.logger.log("body::")
  functions.logger.log(body)

  let events = body.events || []
  let firstEvent = events[0] || {}
  let eventType = firstEvent.type || {}
  let source = firstEvent.source || {}
  let message = firstEvent.message || {}
  if(eventType === "join") {
    addGroup(firstEvent)
    res.json({})
    return
  }

  if(eventType !== "message") {
    functions.logger.log("eventType 不是 join 也不是message喔")
    res.json({})
    return
  }

  if(message.type !== "text") {
    functions.logger.log("message.type 不是 text喔")
    res.json({})
    return
  }

  let msgTxt = message.text || ""
  let twoChars = msgTxt.substring(0, 2)
  if(twoChars === "查看") {
    await checkMsgForOfficer(firstEvent)
    res.json({})
    return
  }

  if(msgTxt === "清空模板") {
    await clearTempl(firstEvent)
    res.json({})
    return
  }

  if(twoChars === '回報' || twoChars === "Re" || twoChars === "RE" || twoChars === "re") {
    if(source.type === 'group') await handleReport(firstEvent)
    else sendMsgByReplyToken("必須在群組裡才能回報喔!", firstEvent.replyToken)
    
    res.json({})
    return
  }

  let nameReg = /姓名/g
  let nameMatch = msgTxt.match(nameReg)
  if(nameMatch && nameMatch.length > 8) {
    functions.logger.log("用戶用了舊的方式......")
    await handleOldReport(firstEvent)
  }

  res.json({})
})

/***************** 處理清空模板 *************************/
async function clearTempl(eventObj) {
  let userId = eventObj.source.userId
  let groupId = eventObj.source.groupId || ""
  functions.logger.info("請求清空模板......")

  let displayName = await getUserNickName(userId, groupId)
  functions.logger.info("displayName: ", displayName)
  let {ying, lian, no} = getYingLianNoName(displayName)
  let {isOk, ban, studentNoList, tempMsg} = await getLianTemplAndBreakPoint({ying, lian, no})
  if(!isOk) {
    functions.logger.info("getLianTemplAndBreakPoint 為 false")
    return
  }
  let dragonMsg = getEmptyMsg({ying, lian, studentNoList, ban})

  functions.logger.info("清空後的 dragonMsg: ", dragonMsg)

  let sendMsg = tempMsg + dragonMsg
  sendMsgByReplyToken(sendMsg, eventObj.replyToken)

  let storData = {
    ying, lian, ban, userId, displayName,
    msg: dragonMsg, groupId
  }
  await storageMessage(storData)

  functions.logger.info("## 執行完 清空模板 ##")
  return {cyzMsg: "執行完 清空模板"}
}

/***************** 處理回報 *********************/
/**** 使用了標準格式 *******/
async function handleReport(eventObj) {
  let correctMessage = `請輸入正確格式:
  ==========
  Re
  (必填，在哪裡)
  (必填，跟誰)
  (可選，做甚麼)
  ==========`
  let userId = eventObj.source.userId
  let groupId = eventObj.source.groupId || ""
  let message = eventObj.message || {}
  let msgTxt = message.text || ""
  let matchN = msgTxt.match(/\n/g)
  //檢查有沒有 兩個換行
  if(!matchN || matchN.length < 2) {
    sendMsgByReplyToken(correctMessage, eventObj.replyToken)
    return
  }

  let {location, people, doing} = getWhereWithDoing(msgTxt)
  if(!location || !people || people.length < 2) {
    sendMsgByReplyToken(correctMessage, eventObj.replyToken)
    return
  }

  functions.logger.info(" ############ ")
  functions.logger.info("location: ", location)
  functions.logger.info("people: ", people)
  functions.logger.info("doing: ", doing)
  functions.logger.info(" ############ ")

  if(!userId) {
    functions.logger.warn("沒有 userId!!!!")
    return
  }

  if(!groupId) {
    functions.logger.warn("沒有 groupId!!!!")
    return
  }

  let displayName = await getUserNickName(userId, groupId)
  functions.logger.info("displayName: ", displayName)
  if(!displayName) {
    functions.logger.warn("沒有displayName!!!")
    return
  }

  let {ying, lian, no, name} = getYingLianNoName(displayName)
  if(!ying || !lian || !no) {
    sendMsgByReplyToken("LINE暱稱格式不合規", eventObj.replyToken)
    return
  }

  let {isOk, ban, studentNoList, tempMsg} = await getLianTemplAndBreakPoint({ying, lian, no})
  if(!isOk) {
    sendMsgByReplyToken("還沒有該連的模板DATA", eventObj.replyToken)
    return
  }
  
  let {dragonMsg} = await getCurrentTempl({ying, lian, ban, studentNoList})
  dragonMsg = fitMessage({originalText: dragonMsg, ying, lian, no, name, location, people, doing})
  if(!dragonMsg) {
    functions.logger.warn("沒有dragonMsg消息")
    return
  }
  functions.logger.log("看一下 dragonMsg: ")
  functions.logger.log(dragonMsg)
  let sendMsg = tempMsg + dragonMsg
  sendMsgByReplyToken(sendMsg, eventObj.replyToken)

  let storData = {
    ying, lian, ban, userId, displayName,
    msg: dragonMsg, groupId
  }
  await storageMessage(storData)
  return {cyzMsg: "你執行完了全部"}
}

/** 使用了傳統接龍格式 */
async function handleOldReport(eventObj) {

  //先檢測是否合規
  let userId = eventObj.source.userId
  let groupId = eventObj.source.groupId || ""
  let message = eventObj.message || {}
  let msgTxt = message.text || ""
  if(!isLegalForDragonStyle(msgTxt)) return

  let displayName = await getUserNickName(userId, groupId)
  functions.logger.info("displayName: ", displayName)
  if(!displayName) {
    functions.logger.warn("沒有displayName!!!")
    return
  }
  let {ying, lian, no, name} = getYingLianNoName(displayName)
  if(!ying || !lian || !no) {
    // sendMsgByReplyToken("LINE暱稱格式不合規", eventObj.replyToken)
    return
  }
  let {isOk, ban, studentNoList, tempMsg} = await getLianTemplAndBreakPoint({ying, lian, no})
  if(!isOk) {
    // sendMsgByReplyToken("還沒有該連的模板DATA", eventObj.replyToken)
    return
  }

  //先检查第X班 是否存在
  let regClass = /第\S班\s/
  let matchClass = msgTxt.match(regClass)
  let msg2 = ""
  if(matchClass && matchClass.index > 10) {
    msg2 = msgTxt.substring(matchClass.index)
  }


  let {location, people, doing} = transferOldMsg({msg: msgTxt, ying, lian, no})
  if(!location || !people || people.length < 2) {
    // sendMsgByReplyToken(correctMessage, eventObj.replyToken)
    return
  }
  
  let {dragonMsg, lastSendStamp = 0} = await getCurrentTempl({ying, lian, ban, studentNoList})
  dragonMsg = fitMessage({originalText: dragonMsg, ying, lian, no, name, location, people, doing})
  if(!dragonMsg) {
    functions.logger.warn("在handleOldReport裡 沒有dragonMsg消息")
    return
  }
  let sendMsg = tempMsg + dragonMsg
  
  functions.logger.log("傳來的文字 msg2.length: ", msg2.length)
  functions.logger.log("計算出的文字 dragonMsg.length: ", dragonMsg.length)

  let storData = {
    ying, lian, ban, userId, displayName,
    msg: msg2.length > 100 ? msg2 : dragonMsg,
    groupId,
  }

  let now = Date.now()

  if(now < lastSendStamp + (1000 * 9)) {
    functions.logger.log("========  9秒内多條消息  =======")
    functions.logger.log("差了 " + (now - lastSendStamp) + " 毫秒")
    storData.msg = dragonMsg
    sendMsgByReplyToken(sendMsg, eventObj.replyToken)
  }
  else if(dragonMsg.length >= msg2.length + 3 && dragonMsg.length <= msg2.length + 24) {
    functions.logger.log("dragonMsg 竟然比msg2 多")
    functions.logger.log("也就是 出現了有人漏了一個他人的消息")
    functions.logger.log("msg2: ", msg2)
    functions.logger.log("dragonMsg: ", dragonMsg)
    storData.msg = dragonMsg
    // sendMsgByReplyToken(sendMsg, eventObj.replyToken)
  }
  

  functions.logger.log("storData::")
  functions.logger.log(storData)

  await storageMessage(storData)
  return {cyzMsg: "你執行完了全部"}
}

function isLegalForDragonStyle(msg) {
  let reg = /學號：\d\d\d\d\d/g
  let match = msg.match(reg)
  if(!match || match.length < 5) {
    reg = /學號: \d\d\d\d\d/g
    match = msg.match(reg)
    if(!match || match.length < 5) return false
  }
  return true
}

//從接龍格式提取 location people doing
function transferOldMsg({ying, lian, no, msg} = {}) {
  let myID = "" + ying + lian + format0(no, 3)
  let muban = "學號：" + myID
  let idx = msg.indexOf(muban)
  if(idx < 0) {
    muban = "學號: " + myID
    idx = msg.indexOf(muban)
    if(idx < 0) return {}
  }
  let tmpMsg = msg.substring(idx + 3)
  let targetMsg = tmpMsg
  let reg = /學號[:：]/
  let match = tmpMsg.match(reg)
  if(match && match.index > 1) {
    targetMsg = targetMsg.substring(0, match.index)
  }
  let msgList = targetMsg.split("\n")
  if(!msgList || msgList.length < 4) return {}
  let location = msgList[2].length > 3 ? msgList[2].substring(3) : ""
  let people = msgList[3].length > 3 ? msgList[3].substring(3) : ""
  let doing = msgList[4] && msgList[4].length > 1 ? msgList[4] : ""
  return {location, people, doing}
}


async function storageMessage({ying, lian, ban, userId, displayName, msg, groupId} = {}) {
  let nowStrUTC8 = getNowStringUTC8()
  let up = {
    forUserId: userId, groupId,
    msg, createStamp: Date.now(), createTime: nowStrUTC8, 
    ying, lian, ban, forDisplayName: displayName
  }
  const db = admin.firestore()
  const collection = db.collection("J6_Msg")
  let qRes = await collection.add(up)
  return
}

/**
 * 
 * @return {String} fittedMsg: 擬和好的消息
 */
function fitMessage({originalText, ying, lian, no, name, location, people, doing} = {}) {
  let fittedMsg = ""
  let endMsg = ""
  let myID = "" + ying + "" + lian + "" + format0(no, 3)
  let muban = "學號：" + myID
  let dot1 = originalText.indexOf(muban)
  if(dot1 < 0) {
    return ""
  }
  if(dot1 > 0) {
    fittedMsg = originalText.substring(0, dot1)
  }
  let reg = /\n學號：/
  let match = originalText.substring(dot1).match(reg)
  if(match && match.index > 0) {
    endMsg = originalText.substring(dot1 + match.index + 1)
  }

  let middleMsg = "學號：" + myID + "\n"
  middleMsg += ("姓名：" + name + "，收到\n")
  middleMsg += ("地點：" + location + "\n")
  middleMsg += ("跟誰：" + people + "\n")
  if(doing) middleMsg += (doing + "\n")
  middleMsg += "\n"

  fittedMsg += (middleMsg + endMsg)
  return fittedMsg
}

//挖出 地點 跟誰 做甚麼
function getWhereWithDoing(plainTxt) {
  let msgTxt = plainTxt

  let reg = /\S+/g
  let match = msgTxt.match(reg)
  if(!match || match.length < 3) return {}

  let location = match[1] ? match[1] : ""
  let people = match[2] ? match[2] : ""
  let doing = ""
  if(match.length > 3) {
    for(let i=3; i<match.length; i++) {
      doing += (match[i] + " ")
    }
  }
  return {location, people, doing}
}


/******** 處理長官們發"查看"命令 ********/
async function checkMsgForOfficer(eventObj) {

  let ying, lian, ban, target
  let message = eventObj.message || {}
  let text = message.text || ""
  let reg = /\d營\d連\d+班/
  let found = text.match(reg)
  
  if(!found) {
    //針對兵器連
    reg = /\d營兵器連\d+班/
    found = text.match(reg)
    if(!found) {
      sendMsgByReplyToken("有效格式為: 查看X營X連X班 (其中X連可以輸入兵器連)", eventObj.replyToken)
      return
    }
    lian = 4
    target = found[0]
    ying = Number(target[0])

    //取班級
    target = target.substring(5)
    reg = /\d+/
    found = target.match(reg)
    ban = Number(found[0])
  }
  else {
    target = found[0]
    reg = /\d+/g
    found = target.match(reg)
    ying = Number(found[0])
    lian = Number(found[1])
    ban = Number(found[2])
  }

  //去查看是否為合法的長官


}


/******** 處理加入群組事件 *******/
async function addGroup(eventObj) {
  let source = eventObj.source || {}
  let groupId = source.groupId || ""
  let opt = {
    url: "https://api.line.me/v2/bot/group/" + groupId + "/summary",
    method: "GET",
    headers: {
      "Authorization": "Bearer " + LINE_TOKEN,
    },
  }

  return new Promise(a => {
    req(opt, async (err, res, body) => {
      if(typeof body === 'string') body = JSON.parse(body)
      if(!body.groupName) {
        return
      }

      let originalData = {isOn: true, joinTime: getNowStringUTC8(), createStamp: Date.now()}
      let uploadData = Object.assign(originalData, body)
      const writeResult = await admin.firestore().collection("J6_Group").add(uploadData)
      a({cyzMsg: "成功啦!!!"})

    })

  })
  
}

/**************************** 共用函式  **************************/
/** 獲取UTC+8的Date */
function getDateUTC8() {
  let d = new Date()
  let timeZone = -d.getTimezoneOffset() / 60
  let stampUTC8 = Date.now() + ((8 - timeZone) * 1000 * 60 * 60)
  return new Date(stampUTC8)
}

/** 獲取當前 UTC+8 自定義時間格式 xxxx/xx/xx hh:mm:ss_xxx */
function getNowStringUTC8() {
  let d = getDateUTC8()
  let yy = d.getFullYear()
  let mm = format0(d.getMonth() + 1)
  let dd = format0(d.getDate())
  let hr = format0(d.getHours())
  let min = format0(d.getMinutes())
  let sec = format0(d.getSeconds())
  let milli = format0(d.getMilliseconds(), 3)
  return "" + yy + "/" + mm + "/" + dd + " " + hr + ":" + min + ":" + sec + "_" + milli
}

/** 將時間格式轉為0開頭 */
function format0(value, toFix = 2) {
  let str = ""
  if(typeof value === "number") value = String(value)
  if(value.length >= toFix) return value
  for(let i=0; i < toFix-value.length; i++) {
    str += "0"
  }
  str += value
  return str
}

/**使用replyToken 發送消息 */
async function sendMsgByReplyToken(msg, replyToken) {
  let opt = {
    url: "https://api.line.me/v2/bot/message/reply",
    method: "POST",
    json: true,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_TOKEN,
    },
    body: {
      replyToken,
      messages: [{type: "text", text: msg}]
    }
  }

  return new Promise(a => {
    req(opt, async (err, res, body) => {a("")})
  })

}

/**push message 不用replyToken 即可发消息 */
async function sendPushMsg(msg = "崔崔测试一下", toId) {
  let opt = {
    url: "https://api.line.me/v2/bot/message/push",
    method: "POST",
    json: true,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_TOKEN,
    },
    body: {
      to: toId,
      messages: [{type: "text", text: msg}]
    }
  }

  return new Promise(a => {
    req(opt, async (err, res, body) => {})
  })

}

/** 獲取當前情況的模板，不包含前半段那長串 */
/** 回報時間段
 *  0000-0800
 *  0800-1200 (要求)
 *  1200-1600 (要求)
 *  1600-2000 (要求)
 */
async function getCurrentTempl({ying, lian, ban, studentNoList} = {}) {
  let nowDate = getDateUTC8()
  let yy = nowDate.getFullYear()
  let mm = format0(nowDate.getMonth() + 1)
  let dd = format0(nowDate.getDate())
  let s1 = "" + yy + "/" + mm + "/" + dd + " "
  let s2 = ":00:00_000"
  let hr = nowDate.getHours()
  let min = nowDate.getMinutes()
  let middle = "00"
  if(hr >= 22) middle = "22"
  else if(hr >= 17) middle = "16"
  else if(hr === 16) {
    if(min >= 20) middle = "16"
    else middle = "12"
  }
  else if(hr >= 12) middle = "12"
  else if(hr >= 8) middle = "08"
  let startIndex = s1 + middle + s2

  if(middle === "16") {
    startIndex = s1 + middle + ":20:00_000"
  }

  const db = admin.firestore()
  let c = db.collection('J6_Msg')

  let q = c.where("ying", "==", ying)
  q = q.where("lian", "==", lian)
  q = q.where("ban", "==", ban)
  q = q.where("createTime", ">=", startIndex)
  q = q.orderBy("createTime", "desc")
  q = q.limit(3)

  let resForStartIndex = await q.get()
  if(resForStartIndex.empty) {
    return { dragonMsg: getEmptyMsg({ying, lian, studentNoList, ban}), lastSendStamp: 0 }
  }
  let firstObj = resForStartIndex.docs[0]
  let firstData = firstObj.data()
  return {dragonMsg: firstData.msg, lastSendStamp: firstData.createStamp || 0}
}

function getEmptyMsg({ying, lian, studentNoList, ban} = {}) {
  let str = "第" + ban + "班\n"
  for(let i=0; i<studentNoList.length; i++) {
    str += ("學號：" + ying + lian + format0(studentNoList[i], 3) + "\n")
    str += ("姓名：" + "\n")
    str += ("地點：" + "\n")
    str += ("跟誰：" + "\n\n")
  }
  return str
}

/** 獲取各連模板數據和斷點 */
// 返回: {isOk: Boolean, studentNoList, tempMsg, ban}
// 其中 studentList為Number組成的數組 [95, 96, 97, 98, 99, ......, 107]
async function getLianTemplAndBreakPoint({ying, lian, no} = {}) {
  let liansRef = admin.firestore().collection("J6_Lian")
  let q = liansRef.where("ying", "==", ying)
  q = q.where("lian", "==", lian)

  const QUERY_SNAPSHOT = await q.get()
  if(QUERY_SNAPSHOT.empty) {
    return {isOk: false, errMsg: "No template in database"}
  }
  let lianData = QUERY_SNAPSHOT.docs[0].data()

  let tempMsg = lianData.tempMsg
  if(!tempMsg || !lianData.class1) {
    return {isOk: false, errMsg: "No template in database"}
  }
  let studentList = []
  let i = 1
  let myClass = ""
  let ban = 0

  //去找落在哪一班
  while(true) {
    if(i > 20) break
    let theClass = lianData["class" + i]
    if(!theClass) break
    let s1 = theClass.split(",")
    for(let j=0; j<s1.length; j++) {
      let s2 = s1[j].split("-")
      if(s2.length < 2) {
        //只有單數
        let num = Number(s2[0])
        if(num !== NaN && num === no) {
          ban = i
          myClass = theClass
          break
        }
      }
      else {
        //是一列數
        let firstNum = Number(s2[0])
        let endNum = Number(s2[1])
        for(let k=firstNum; k<=endNum; k++) {
          if(k === no) {
            ban = i
            myClass = theClass
            break
          }
        }
        if(myClass) break
      }
    }

    if(myClass) break
    i++
  }

  if(!myClass) {
    return {isOk: false, errMsg: "Cound not find you"}
  }

  //知道是哪一班後 生成該班同學的學號list
  let s1 = myClass.split(",")
  for(let j=0; j<s1.length; j++) {
    let s2 = s1[j].split("-")
    if(s2.length < 2) {
      let num = Number(s2[0])
      if(num !== NaN) studentList.push(num)
    }
    else {
      let firstNum = Number(s2[0])
      let endNum = Number(s2[1])
      for(let k=firstNum; k<=endNum; k++) {
        studentList.push(k)
      }
    }
  }

  return {isOk: true, tempMsg, studentNoList: studentList, ban}
}


/** 獲取用戶暱稱 */
/**
 * 
 * @param {String} userId: 用戶userId
 * @return {String} displayName: 用戶的LINE暱稱 
 */ 
async function getUserNickName(userId, groupId) {
  const db = admin.firestore()
  const collection = db.collection("J6_User")
  let docIdForUser = ""
  let userRef = db.collection('J6_User')
  let q = userRef.where("userId", "==", userId)
  let qSnapshot = await q.get()
  if(!qSnapshot.empty) {
    let userData = qSnapshot.docs[0].data()
    let oDisplayName = userData.displayName
    let editStamp = userData.editStamp || 1
    let diffStamp = Date.now() - editStamp
    if(diffStamp < (1000 * 60 * 60 * 24)) return oDisplayName
    else docIdForUser = qSnapshot.docs[0].id
  }

  let opt = {
    url: "https://api.line.me/v2/bot/group/" + groupId + "/member/" + userId,
    method: "GET",
    headers: {
      "Authorization": "Bearer " + LINE_TOKEN,
    },
  }

  return new Promise(a => {
    req(opt, (err, res, body) => {
      if(typeof body === 'string') body = JSON.parse(body)
      functions.logger.info("/bot/profile: ", body)
      if(!body || !body.displayName) {
        a("")
        return
      }
      let nowStr = getNowStringUTC8()
      let nowStamp = Date.now()
      let originalData = {editTime: nowStr, editStamp: nowStamp}
      let uploadData = Object.assign(originalData, body)
      if(docIdForUser) collection.doc(docIdForUser).set(uploadData, {merge: true})
      else {
        uploadData.createTime = nowStr
        uploadData.createStamp = nowStamp
        collection.add(uploadData)
      }
      a(body.displayName)
    })

  })

}


/**
 * 
 * @param {String} displayName: 用戶的LINE暱稱
 */
function getYingLianNoName(displayName) {
  let reg = /\d\d\d\d\d/
  let match = displayName.match(reg)
  if(!match) return {}
  let str = match[0]
  let ying = Number(str[0])
  let lian = Number(str[1])
  let no = Number(str.substring(2))
  
  let reg2 = /\S{2,10}/
  displayName = displayName.substring(5)
  let match2 = displayName.match(reg2)
  if(!match2) return {}
  let name = match2[0]

  return {ying, lian, no, name}
}



