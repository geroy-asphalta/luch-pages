// Official Russian federal production calendars, FIVE-DAY workweek, 2026–2027.
// Statutory holidays: Art. 112 of the Russian Labour Code.
// 2026 transfers: Government decree 24.09.2025 No. 1466.
// 2027 transfers: Government decree 17.09.2026 No. 1187.
// Sources: https://www.consultant.ru/law/ref/calendar/proizvodstvennye/2026/
//          https://www.consultant.ru/law/ref/calendar/proizvodstvennye/2027/
//          https://www.consultant.ru/document/cons_doc_LAW_515170/
//          https://www.consultant.ru/document/cons_doc_LAW_544706/
// These are FEDERAL days only; individual Russian regions may have additional holidays.
// No assumptions are made about national calendars beyond 2027.

export const RU_PRODUCTION_YEARS=[2026,2027];
export const RU_PRODUCTION_SOURCES={
  2026:'https://www.consultant.ru/law/ref/calendar/proizvodstvennye/2026/',
  2027:'https://www.consultant.ru/document/cons_doc_LAW_544706/'
};
const HOLIDAYS=[
 ['01-01','Новогодние каникулы'],['01-02','Новогодние каникулы'],
 ['01-03','Новогодние каникулы'],['01-04','Новогодние каникулы'],
 ['01-05','Новогодние каникулы'],['01-06','Новогодние каникулы'],
 ['01-07','Рождество Христово'],['01-08','Новогодние каникулы'],
 ['02-23','День защитника Отечества'],
 ['03-08','Международный женский день'],
 ['05-01','Праздник Весны и Труда'],['05-09','День Победы'],
 ['06-12','День России'],['11-04','День народного единства']
];
const TRANSFERS={
  2026:{
    '01-09':['Выходной: перенос с 3 января',false],
    '03-09':['Выходной: перенос с 8 марта',false],
    '05-11':['Выходной: перенос с 9 мая',false],
    '12-31':['Выходной: перенос с 4 января',false]
  },
  2027:{
    '02-20':['Рабочая суббота: перенос на 22 февраля',true],
    '02-22':['Выходной: перенос с 20 февраля',false],
    '05-03':['Выходной: перенос с 1 мая',false],
    '05-10':['Выходной: перенос с 9 мая',false],
    '06-14':['Выходной: перенос с 12 июня',false],
    '11-05':['Выходной: перенос с 2 января',false],
    '12-31':['Выходной: перенос с 3 января',false]
  }
};
const byYear={};
for(const year of RU_PRODUCTION_YEARS){
 const entries=new Map();
 for(const [day,title] of HOLIDAYS)entries.set(year+'-'+day,{
   date:year+'-'+day,title,working:false,holiday:true,kind:'holiday',source:'RU-federal'
 });
 for(const [day,[title,working]] of Object.entries(TRANSFERS[year])){
   entries.set(year+'-'+day,{
     date:year+'-'+day,title,working,holiday:false,kind:working?'working-transfer':'transfer',source:'RU-federal'
   });
 }
 byYear[year]=entries;
}
export function ruProductionDay(date){
 const year=Number(String(date||'').slice(0,4));
 return byYear[year]?.get(date)||null;
}
export function ruProductionDays(year){
 const list=byYear[Number(year)];
 return list?[...list.values()].sort((a,b)=>a.date.localeCompare(b.date)):[];
}
export const ruProductionYearSupported=year=>RU_PRODUCTION_YEARS.includes(Number(year));
