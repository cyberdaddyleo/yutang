export const STORE_KEY = 'mofish-muyu-v1';
export const SKINS = Object.freeze([
  {id:'walnut',name:'经典胡桃',material:'胡桃木纹'},
  {id:'ebony',name:'乌木静心',material:'细密乌木'},
  {id:'jade',name:'白玉清心',material:'半透白玉'},
  {id:'celadon',name:'青瓷听雨',material:'青瓷开片'},
  {id:'lacquer',name:'朱漆如意',material:'朱红漆面'},
  {id:'gold',name:'鎏金莲纹',material:'金属莲纹'},
  {id:'bamboo',name:'竹韵清风',material:'竹节纤维'},
  {id:'clay',name:'暖陶朴心',material:'温润粗陶'},
]);
export const TONES = Object.freeze([{id:'wood',name:'温润木声'},{id:'deep',name:'低沉禅音'},{id:'clear',name:'清脆轻响'}]);
export const PHRASE_GROUPS = Object.freeze([
  {id:'merit',name:'一念清净',phrases:['功德+1','心安+1','福气+1','烦恼-1']},
  {id:'work',name:'从容工作',phrases:['工资+1','灵感+1','准时下班','慢慢来']},
  {id:'calm',name:'莫生气',phrases:['莫生气','放轻松','不着急','深呼吸']},
  {id:'daily',name:'小小日常',phrases:['好好吃饭','睡个好觉','多喝温水','照顾自己']},
  {id:'wish',name:'心有所愿',phrases:['平安喜乐','万事顺意','好事将近','心想事成']},
  {id:'present',name:'此刻自在',phrases:['专注当下','一念自在','静听木声','今日也好']},
]);
export const INTERVALS = Object.freeze([.5,1,2,3]);
export const FOCUS_MINUTES = Object.freeze([5,15,25,45]);
export const DEFAULT_SETTINGS = Object.freeze({
  skin:'walnut',tone:'wood',interval:1,phraseMode:'fixed',phraseGroup:'merit',fixedPhrase:'功德+1',customPhrases:Object.freeze([]),
  textDirection:'horizontal',textColor:'#f6d9a0',textSize:36,floatingText:true,reducedMotion:false,sound:true,volume:1,
  season:'auto',time:'auto',lights:'auto',smoke:true,
});
