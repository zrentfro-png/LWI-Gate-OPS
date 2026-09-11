const SHEET_ID = '1CPmhAJ6Pb0wNQKLW3Q8_Nu7nmRtfRL-yGgqqJdPCVIY';
const SHEET_NAME = 'flights';
const BASELINE_SHEET_NAME = '_gateops_standard';
const ID_COLUMN = 'GATEOPS ID';
const EXTRA_COLUMNS = ['GATE BLOCK START:', 'DELAY TAG:', ID_COLUMN];

const STANDARD_VERSION = 'uploaded-standard-2026-09-11-895';
const STANDARD_HEADERS = ['AIRLINE','FLIGHT NUMBER','TO:','GATE:','BOARDING TIME:','DEPARTURE TIME:','STATUS:','COMMENTS'];
// Protected recurring schedule supplied by the user. This is never generated
// from the live flights sheet and cannot be overwritten by simulation changes.
const STANDARD_FLIGHTS = [["Delta","DL1426","Cincinnati","D5","11:30 PM","12:00 AM","",""],["United","UA2353","CHARLOTTE","A24","11:36 PM","12:06 AM","",""],["Alaska","AS1782","PORTLAND","B30","11:36 PM","12:06 AM","",""],["Frontier","F92088","PHILLDELPHIA","D26","11:36 PM","12:06 AM","",""],["UNITED","UA2","SIN","A8","11:45 PM","12:15 AM","",""],["Southwest","WN1717","PHILADELPHIA","C24","11:30 PM","12:15 AM","",""],["United","UA297","Honolulu","A15","11:30 PM","12:30 AM","",""],["American","AA1507","CHICAGO O'HARE","B8","12:05 AM","12:35 AM","",""],["Allegiant","G43523","CASPER","D37","12:05 AM","12:35 AM","",""],["United","UA2766","Newark","A22","12:06 AM","1:06 AM","",""],["Alaska","AS5948","KANSAS CITY","B26","12:57 AM","1:22 AM","",""],["Alaska","AS2294","Seattle","B29","1:20 AM","1:50 AM","",""],["United","UA2487","Houston","A16","1:30 AM","2:00 AM","",""],["American","AA717","PHILADELPHIA","B9","1:30 AM","2:00 AM","",""],["Frontier","F93192","Pittsburgh","D28","1:30 AM","2:00 AM","",""],["Allegiant","G43748","Norfolk","D40","1:30 AM","2:00 AM","",""],["American","AA1852","AUSTIN","B10","1:39 AM","2:09 AM","",""],["United","UA6839","Kansas City","A9","1:45 AM","2:15 AM","",""],["American","AA337","Cleveland","B11","1:45 AM","2:15 AM","",""],["Spirit","NK979","Chicago O'Hare","D30","2:15 AM","2:45 AM","",""],["United","UA253","Washington IAD","A5","2:30 AM","3:00 AM","",""],["Delta","DL452","Boston","D15","2:45 AM","3:15 AM","",""],["Allegiant","G46688","Kansas City","D36","2:45 AM","3:15 AM","",""],["American","AA1812","Nashville","B8","3:00 AM","3:30 AM","",""],["American","AA386","Baltimore","B13","3:30 AM","4:00 AM","",""],["Delta","DL471","Detroit","D10","3:30 AM","4:00 AM","",""],["Allegiant","G42357","Las Vegas","D37","3:30 AM","4:00 AM","",""],["Spirit","NK1838","Baltimore","D31","3:45 AM","4:15 AM","",""],["United","UA2683","Dallas Fort-Worth","A1","4:00 AM","4:30 AM","",""],["American","AA342","Portland","B14","4:00 AM","4:30 AM","",""],["Alaska","AS2416","San Jose","B28","4:00 AM","4:30 AM","",""],["Alaska","AS607","Seattle","B29","4:00 AM","4:30 AM","",""],["Southwest","WN2669","Oakland","C22","4:00 AM","4:30 AM","",""],["Delta","DL1014","Albuquerque","D1","4:00 AM","4:30 AM","",""],["Delta","DL1085","Seattle","D2","3:30 AM","4:30 AM","",""],["Sun Country","SY2487","Minneapolis","D41","4:10 AM","4:40 AM","",""],["Southwest","WN3981","Honolulu","C18","4:15 AM","4:45 AM","",""],["United","UA4595","Boise","A4","4:30 AM","5:00 AM","",""],["Alaska","B6353","Boston","B17","4:30 PM","5:00 AM","",""],["Delta","DL2498","Albuquerque","D13","4:30 PM","5:00 AM","",""],["Delta","DL2463","Houston","D17","4:30","5:00 AM","",""],["Frontier","F91724","Phoenix","D29","4:30 AM","5:00 AM","",""],["Allegiant","G43101","Boise","D37","4:30 AM","5:00 AM","",""],["Allegiant","G4952","Reno","D39","4:30 AM","5:00 AM","",""],["Alaska","B61286","Jacksonville","B24","4:45 AM","5:15 AM","",""],["American","AA6072","Kansas City","B5","4:45 AM","5:15 AM","",""],["Southwest","WN690","Houston- Corpus Christi","C11","4:45 AM","5:15 AM","",""],["Breeze","MK1816","San Francisco","C28","4:45 AM","5:15 AM","",""],["Southwest","WN2314","Chicago Midway","C17","4:50 PM","5:18 AM","",""],["United","UA1363","Los Angeles","A19","5:00 AM","5:30 AM","",""],["United","UA2438","Atlanta","A3","5:00 AM","5:30 AM","",""],["Alaska","B6582","Miami","B23","5:00 AM","5:30 AM","",""],["Southwest","WN2394","Baltimore","C12","5:00 AM","5:30 AM","",""],["United","UA2893","Tampa","A23","5:05 AM","5:38 AM","",""],["United","UA840","Houston","A14","5:15 AM","5:45 AM","",""],["American","AA5691","Charleston","B10","5:30 AM","6:00 AM","",""],["Alaska","B62716","New York JFK","B15","5:30 PM","6:00 AM","",""],["Alaska","AS2439","San Diego","B30","5:30 AM","6:00 AM","",""],["Southwest","WN499","Tampa","C19","5:30 AM","6:00 AM","",""],["Delta","DL869","Salt Lake City","D14","5:30 AM","6:00 AM","",""],["Alaska","AS2343","Seattle","B25","5:30 AM","6:01 AM","",""],["Southwest","WN2411","Dallas Love Field","C4","5:35 AM","6:05 AM","",""],["Southwest","WN2635","Minneapolis","C15","5:40 AM","6:10 AM","",""],["Delta","DL344","Minneapolis","D6","5:40 AM","6:10 AM","",""],["Alaska","B6943","Phillidelphia","B19","5:45 AM","6:15 AM","",""],["Delta","DL2133","Salt Lake City","D19","5:45 AM","6:15 AM","",""],["United","UA2886","Newark","A13","5:50 AM","6:20 AM","",""],["United","UA522","INDIANAPOLIS","A5","5:51 PM","6:21 AM","",""],["American","AA1386","Philadelphia","B14","6:00 AM","6:30 AM","",""],["Southwest","WN4813","Santa Barbara","C10","5:00 AM","6:30 AM","",""],["Spirit","NK1581","Baltimore","D30","6:00 AM","6:30 AM","",""],["Allegiant","G5428","Appleton","D38","6:00 AM","6:30 AM","",""],["Delta","DL2007","New York JFK","D4","5:00 AM","6:30 AM","",""],["Allegiant","G44199","Fresno","D40","6:00 AM","6:30 AM","",""],["United","UA1117","Washington DCA","A7","6:05 AM","6:35 AM","",""],["Southwest","WN1625","NEW YORK LAGUARDIA","C13","6:06 AM","6:36 AM","",""],["American","AA357","MIAMI","B4","6:11 AM","6:41 AM","",""],["Breeze","MX2963","Las Vegas","C28","6:15 AM","6:45 AM","",""],["Delta","DL836","Seattle","D1","6:15 AM","6:45 AM","",""],["Alaska","B61099","New York JFK","B17","6:20 AM","6:50 AM","",""],["Alaska","B6435","New York JFK","B22","6:25 AM","6:55 AM","",""],["Southwest","WN2251","Seattle","C2","5:25 AM","6:55 AM","",""],["Southwest","WN5213","Pittsburgh","C23","6:25 AM","6:55 AM","",""],["Southwest","WN4814","Memphis","C7","5:25 AM","6:55 AM","",""],["Delta","DL2452","Seattle","D10","5:25 AM","6:55 AM","",""],["United","UA6656","Kansas City","A10","6:30 AM","7:00 AM","",""],["United","UA5548","Colorado Springs","A11","6:30 AM","7:00 AM","",""],["American","AA1506","Orlando","B9","6:30 AM","7:00 AM","",""],["Southwest","WN4537","Reno","C5","6:30 AM","7:00 AM","",""],["Delta","DL1938","Detroit","D12","6:30 AM","7:00 AM","",""],["Frontier","F91279","San Francisco","D27","6:30 AM","7:00 AM","",""],["Spirit","NK583","Dallas Fort-Worth","D33","6:30 AM","7:00 AM","",""],["Allegiant","G44247","Sun Valley","D37","6:30 AM","7:00 AM","",""],["United","UA5375","Steamboat Springs","A20","6:31 AM","7:01 AM","",""],["Delta","DL2277","SAN FRANCISCO","D16","6:31 AM","7:01 AM","",""],["Southwest","WN3922","Salt Lake City","C6","5:35 AM","7:05 AM","",""],["Spirit","NK722","Houston","D32","6:35 AM","7:05 AM","",""],["American","AA2102","San Jose","B7","6:45 AM","7:15 AM","",""],["Delta","DL1827","Minneapolis","D15","6:45 AM","7:15 AM","",""],["Southwest","WN417","Salt Lake City","C16","6:50 AM","7:20 AM","",""],["Delta","DL2837","Minneapolis","D11","6:50 AM","7:20 AM","",""],["Hawaiian","HA2385","Honolulu","D44","6:55 AM","7:25 AM","",""],["Alaska","AS2447","New York JFK","B27","7:00 AM","7:26 AM","",""],["United","UA2134","Indianapolis","A14","7:00 AM","7:30 AM","",""],["United","UA2534","Honolulu","A16","7:00 AM","7:30 AM","",""],["United","UA381","Las Vegas","A2","7:00 AM","7:30 AM","",""],["United","UA1968","Denver","A22","7:00 AM","7:30 AM","",""],["United","UA2475","Dallas Fort-Worth","A24","7:00 AM","7:30 AM","",""],["American","AA1385","Cleveland","B12","7:00 AM","7:30 AM","",""],["Sun Country","SY1534","Nashville","D41","7:00 AM","7:30 AM","",""],["American","AA1205","Chicago O'Hare","B1","7:05 AM","7:35 AM","",""],["Spirit","NK399","CHICAGO O'HARE","D31","7:06 AM","7:36 AM","",""],["Southwest","WN2041","Orlando","C15","7:10 AM","7:40 AM","",""],["Delta","DL1501","ATLANTA","D17","7:11 AM","7:41 AM","",""],["American","AA2955","San Francisco","B11","7:15 AM","7:45 AM","",""],["Frontier","F9348","San Antonio","D21","7:15 AM","7:45 AM","",""],["Delta","DL366","Seattle","D6","7:15 AM","7:45 AM","",""],["Southwest","WN260","TAMPA","C17","7:57 AM","8:27 AM","",""],["Southwest","WN2750","Atlanta","C22","7:25 AM","7:54 AM","",""],["United","UA1265","Atlanta","A13","7:30 PM","8:00 AM","",""],["Alaska","AS2890","Portland","B30","7:30 AM","8:00 AM","",""],["Breeze","MK1925","Philldelphia","C29","7:30 AM","8:00 AM","",""],["Delta","DL1680","Los Angeles","D9","7:35 AM","8:05 AM","",""],["United","UA5991","OMAHA","A12","7:36 AM","8:06 AM","",""],["American","AA2947","AUSTIN","B3","7:36 AM","8:06 AM","",""],["American","AA1493","DENVER","B6","7:36 AM","8:06 AM","",""],["Southwest","WN1368","NASHVILLE","C14","7:36 AM","8:06 AM","",""],["Southwest","WN3969","DENVER","C21","7:36 AM","8:06 AM","",""],["Alaska","B6192","Los Angeles","B24","7:45 AM","8:15 AM","",""],["Alaska","AS1521","Las Vegas","B29","7:45 AM","8:15 AM","",""],["Allegiant","G5445","Knoxville","D38","7:45 AM","8:15 AM","",""],["Alaska","B6788","New York JFK","B18","7:50 AM","8:20 AM","",""],["Southwest","WN2602","Austin","C19","7:50 AM","8:20 AM","",""],["American","AA1863","ATLANTA","B10","7:51 AM","8:21 AM","",""],["Southwest","WN2973","MIAMI","C20","7:51 AM","8:21 AM","",""],["Southwest","WN3094","SEATTLE","C8","7:51 AM","8:21 AM","",""],["Delta","DL2820","INDIANAPOLIS","D7","7:51 AM","8:21 AM","",""],["American","AA550","CHARLOTTE","B5","7:56 AM","8:26 AM","",""],["United","UA1114","Fort Lauderdale","A15","8:00 AM","8:30 AM","",""],["United","UA1729","Denver","A26","8:00 AM","8:30 AM","",""],["Avelo","XP430","Los Angeles","A29","8:00 AM","8:30 AM","",""],["United","UA1701","Washington IAD","A6","8:00 AM","8:30 AM","",""],["United","UA2133","Washington IAD","A7","8:00 AM","8:30 AM","",""],["Alaska","AS341","Anchorage","B26","8:00 AM","8:30 AM","",""],["Delta","DL629","Boston","D2","8:00 AM","8:30 AM","",""],["Delta","DL993","Houston","D4","8:00 AM","8:30 AM","",""],["Delta","DL1277","Detroit","D5","8:00 PM","8:30 AM","",""],["American","AA781","Dallas","B2","8:05 AM","8:35 AM","",""],["Southwest","WN1939","Burbank","C1","8:05 AM","8:35 AM","",""],["American","AA2467","HOUSTON","B14","8:06 AM","8:36 AM","",""],["Southwest","WN6603","KANSAS CITY","C4","8:06 AM","8:36 AM","",""],["American","AA1745","Las Vegas","B4","8:15 AM","8:45 AM","",""],["Delta","DL2350","Seattle","D13","8:15 AM","8:45 AM","",""],["Delta","DL2838","DENVER","D14","8:16 AM","8:46 AM","",""],["Southwest","WN3718","Miami","C12","8:20 AM","8:50 AM","",""],["Southwest","WN4480","Pittsburgh","C9","8:20 AM","8:50 AM","",""],["Delta","DL1238","Atlanta","D10","8:20 AM","8:50 AM","",""],["United","UA718","Alburquerque","A24","8:30 AM","9:00 AM","",""],["United","UA1045","Los Angeles","A27","8:30 AM","9:00 AM","",""],["United","UA1569","Boston","A5","8:30 AM","9:00 AM","",""],["United","UA2896","Chicago O'Hare","A8","8:30 AM","9:00 AM","",""],["American","AA2353","Austin","B13","8:30 AM","9:00 AM","",""],["Southwest","WN439","San Jose","C10","8:30 AM","9:00 AM","",""],["Southwest","WN821","Cincinnati","C18","8:30 AM","9:00 AM","",""],["Frontier","F91801","Atlanta","D27","8:30 AM","9:00 AM","",""],["Delta","DL2993","New York JFK","D8","8:30 AM","9:00 AM","",""],["American","AA194","SAN FRANCISCO","B8","8:31 AM","9:01 AM","",""],["Southwest","WN2122","PHOENIX","C7","8:31 AM","9:01 AM","",""],["Delta","DL579","NEW YORK JFK","D19","8:31 AM","9:01 AM","",""],["Southwest","WN2797","Seattle","C25","8:35 AM","9:05 AM","",""],["Delta","DL719","Los Angeles","D18","8:35 AM","9:05 AM","",""],["Southwest","WN4927","CHEYENNE","C11","8:42 AM","9:12 AM","",""],["United","UA1176","Philadelphia","A2","8:45 AM","9:15 AM","",""],["American","AA149","Chicago O'Hare","B9","9:21 AM","9:51 AM","",""],["Alaska","B62086","Las Vegas","B16","8:45 AM","9:15 AM","",""],["Alaska","B62513","Burbank","B23","8:45 AM","9:15 AM","",""],["Southwest","WN1254","Las Vegas","C3","9:21 AM","9:51 AM","",""],["Frontier","F9696","Austin","D21","8:50 AM","9:20 AM","",""],["Delta","DL5808","Kansas City","D3","8:50 AM","9:20 AM","",""],["Southwest","WN5877","ST. LOUIS","C2","8:56 AM","9:26 AM","",""],["American","AA1522","PHILADELPHIA","B10","10:03 AM","10:33 AM","",""],["United","UA2887","Fort Lauderdale","A14","9:00 PM","9:30 AM","",""],["United","UA2390","Washington DCA","A17","9:00 AM","9:30 AM","",""],["United","UA5435","Myrtle Beach","A19","9:00 AM","9:30 AM","",""],["United","UA2211","Anchorage","A21","9:00 AM","9:30 AM","",""],["Alaska","AS614","Seattle","B27","9:00 AM","9:30 AM","",""],["Alaska","AS2419","Los Angeles","B30","9:00 AM","9:30 AM","",""],["American","AA5748","Charleston","B5","10:06 AM","10:36 AM","",""],["American","AA1816","Jacksonville","B7","9:00 AM","9:30 AM","",""],["Frontier","F92928","Las Vegas","D20","9:00 AM","9:30 AM","",""],["Spirit","NK1734","Houston","D31","9:05 AM","9:35 AM","",""],["United","UA5279","ASPEN","A10","9:06 AM","9:36 AM","",""],["Delta","DL1240","WASHINGTON IAD","D12","9:06 AM","9:36 AM","",""],["Southwest","WN1050","LOS ANGELES","C16","9:11 AM","9:41 AM","",""],["Alaska","B66607","Kansas City","B21","9:15 AM","9:45 AM","",""],["Southwest","WN354","Washington DCA","C13","9:15 AM","9:45 AM","",""],["Southwest","WN5499","Savannah","C21","9:15 AM","9:45 AM","",""],["Southwest","WN1740","Los Angeles","C6","9:15 AM","9:45 AM","",""],["Delta","DL2072","New York JFK","D17","9:15 AM","9:45 AM","",""],["Delta","DL524","Denver","D9","9:15 AM","9:45 AM","",""],["Southwest","WN1055","CHICAGO MIDWAY","C24","9:06 AM","9:46 AM","",""],["Southwest","WN2615","ATLANTA","C15","9:20 AM","9:50 AM","",""],["Alaska","B6846","NASHVILLE","B25","9:21 AM","9:51 AM","",""],["Spirit","NK1904","Dallas Fort-Worth","D32","9:30 AM","10:00 AM","",""],["Delta","DL375","Chicago O'Hare","D5","9:30 AM","10:00 AM","",""],["Southwest","WN1492","Boston","C17","9:35 AM","10:05 AM","",""],["Southwest","WN2560","Jacksonville","C26","9:35 AM","10:05 AM","",""],["United","UA5910","KANSAS CITY","A11","9:36 AM","10:06 AM","",""],["United","UA1244","ORLANDO","A18","9:36 AM","10:06 AM","",""],["United","UA2629","ORLANDO","A9","9:36 AM","10:06 AM","",""],["American","AA1612","TAMPA","B12","9:36 AM","10:06 AM","",""],["Southwest","WN1730","NASHVILLE","C23","9:36 AM","10:06 AM","",""],["Southwest","WN951","TAMPA","C5","9:36 AM","10:06 AM","",""],["American","AA315","Portland","B1","9:40 AM","10:10 AM","",""],["United","UA2297","Maui","A16","9:45 AM","10:15 AM","",""],["United","UA515","Atlanta","A25","9:45 AM","10:15 AM","",""],["United","UA204","Minneapolis","A26","9:45 AM","10:15 AM","",""],["United","UA1589","Las Vegas","A4","9:45 AM","10:15 AM","",""],["Delta","DL2421","Nashville","D15","10:21 AM","10:51 AM","",""],["Frontier","F9719","Seattle","D23","9:45 AM","10:15 AM","",""],["United","UA4557","Idaho Falls","A22","8:51 AM","10:21 AM","",""],["American","AA2289","LAS VEGAS","B6","9:51 AM","10:21 AM","",""],["Alaska","B61641","Los Angeles","B18","9:50 AM","10:25 AM","",""],["Southwest","WN708","Phoenix","C12","9:50 AM","10:25 AM","",""],["United","UA1503","Tampa","A12","10:00 AM","10:30 AM","",""],["United","UA690","San Francisco","A23","10:00 AM","10:30 AM","",""],["United","UA1377","Nashville","A24","10:00 AM","10:30 AM","",""],["United","UA1184","Salt Lake City","A26B","10:00 AM","10:30 AM","",""],["United","UA4709","Albany","A27","10:00 AM","10:30 AM","",""],["United","UA451","Dallas Fort-Worth","A7","10:15 AM","10:30 AM","",""],["American","AA2566","Orlando","B11","10:00 AM","10:30 AM","",""],["American","AA5799","Flagstaff","B13","10:00 AM","10:30 AM","",""],["Alaska","AS2042","Las Vegas","B26","10:00 AM","10:30 AM","",""],["Alaska","AS1591","Las Vegas","B28","10:00 AM","10:30 AM","",""],["American","AA1133","Fort Lauderdale","B4","10:36 AM","11:06 AM","",""],["Southwest","WN5180","Albany","C10","10:00 AM","10:30 AM","",""],["Southwest","WN3494","Seattle","C18","10:00 AM","10:30 AM","",""],["Southwest","WN5617","Memphis","C22","10:00 AM","10:30 AM","",""],["Delta","DL572","Miami","D16","10:00 AM","10:30 AM","",""],["Delta","DL2099","Las Vegas","D2","10:00 AM","10:30 AM","",""],["Frontier","F92067","Charlotte","D24","10:00 AM","10:30 AM","",""],["Delta","DL2008","Seattle","D6","10:00 AM","10:30 AM","",""],["United","UA4500","VAIL","A13","10:03 AM","10:33 AM","",""],["American","AA6190","KANSAS CITY","B14","10:06 AM","10:36 AM","",""],["Delta","DL955","PHILLDELPHIA","D7","10:06 AM","10:36 AM","",""],["Sun Country","SY2214","Minneapolis","D41","10:05 AM","10:37 AM","",""],["Avelo","XP2263","Baltimore","A28","10:10 AM","10:40 AM","",""],["Delta","DL940","Los Angeles","D10","10:10 AM","10:40 AM","",""],["Delta","DL1581","Houston","D8","10:15 AM","10:45 AM","",""],["American","AA2324","Denver","B2","10:20 AM","10:50 AM","",""],["Allegiant","G42263","Las Vegas","D38","10:20 AM","10:50 AM","",""],["United","UA388","PHOENIX","A3","10:21 AM","10:51 AM","",""],["Southwest","WN3681","DALLAS LOVE FIELD","C8","10:21 AM","10:51 AM","",""],["Delta","DL519","DENVER","D1","10:22 AM","10:52 AM","",""],["Southwest","WN4875","BIRMINGHAM","C9","10:26 AM","10:56 AM","",""],["United","UA5228","Boise","A17","11:06 AM","11:36 AM","",""],["United","UA1012","Cincinnati","A21","10:30 AM","11:00 AM","",""],["United","UA784","Charlotte","A5","10:30 AM","11:00 AM","",""],["United","UA2318","Washington IAD","B10","11:48 AM","1:08 PM","",""],["American","AA472","Washington DCA","B3","10:30 AM","11:00 AM","",""],["Southwest","WN3291","Columbus","C14","10:30 AM","11:00 AM","",""],["Southwest","WN2159","Tampa","C3","10:30 AM","11:00 AM","",""],["Delta","DL1169","Atlanta","D13","10:30 AM","11:00 AM","",""],["Frontier","F94061","Orange County","D25","10:30 AM","11:00 AM","",""],["United","UA2081","New Orleans","A6","10:36 AM","11:06 AM","",""],["Alaska","B6603","Boston","B22","10:36 AM","11:06 AM","",""],["Southwest","WN6480","KANSAS CITY","C1","10:36 AM","11:06 AM","",""],["Southwest","WN2733","Chicago Midway","C11","11:06 AM","11:34 AM","",""],["Alaska","B61531","Los Angeles","B20","11:41 AM","12:11 PM","",""],["United","UA5467","Rapid City","A15","11:42 AM","12:12 PM","",""],["Southwest","WN5278","Birmingham","C14","12:36 PM","1:30 PM","",""],["Frontier","F91029","PORTLAND","D21","11:42 AM","12:42 PM","",""],["Southwest","WN1131","Phoenix","C3","12:15 PM","12:45 PM","",""],["Alaska","B62152","Phillidelphia","B18","12:30 PM","1:00 PM","",""],["United","UA698","Raleigh","A27","12:36 PM","1:06 PM","",""],["United","UA2792","Phoenix","A9","12:36 PM","1:06 PM","",""],["United","UA272","SAN FRANCISCO","A4","12:27 PM","1:07 PM","",""],["Southwest","WN5840","PENSACOLA","C22","1:02 PM","1:07 PM","",""],["Southwest","WN2076","Los Angeles","C11","12:32 PM","1:07 PM","",""],["FRONTIER","F92068","ORD","D29","12:33 PM","1:08 PM","",""],["Alaska","AS2926","New York JFK","B29","12:02 PM","1:09 PM","",""],["United","UA2613","DETROIT","A11","12:30 PM","1:10 PM","",""],["Alaska","AS1320","SEATTLE","B25","12:10 PM","1:10 PM","",""],["JETBLUE","B68403","DFW","B16","12:25 PM","1:10 PM","",""],["United","UA2540","Austin","A10","12:36 PM","1:11 PM","",""],["United","UA5623","Little Rock","A3","12:36 PM","1:11 PM","",""],["United","UA5217","Oklahoma City","A7","12:36 PM","1:11 PM","",""],["United","UA4819","Palm Springs","A8","12:36 PM","1:11 PM","",""],["Alaska","AS447","Los Angeles","B28","12:36 PM","1:11 PM","",""],["American","AA1997","Atlanta","B3","12:36 PM","1:11 PM","",""],["SUN COUNTRY","GT4695","ATL","D41","12:31 PM","1:11 PM","",""],["Spirit","NK1877","Dallas Fort-Worth","D34","12:21 PM","1:11 PM","",""],["Spirit","NK455","Las Vegas","D33","12:26 PM","1:11 PM","",""],["SPIRIT","NK6405","ORD","D30","12:32 PM","1:12 PM","",""],["Southwest","WN764","HOUSTON HOBBY","C17","11:54 AM","1:14 PM","",""],["Southwest","WN3014","Miami","C21","12:16 PM","1:16 PM","",""],["Spirit","NK447","Las Vegas","D32","12:06 PM","1:16 PM","",""],["Delta","DL1691","Atlanta","D7","12:16 PM","1:16 PM","",""],["United","UA4899","Sun Valley","A20","12:02 PM","1:17 PM","",""],["Southwest","WN761","PHILADELPHIA","C23","11:53 AM","1:18 PM","",""],["Southwest","WN187","DALLAS LOVE FIELD","C20","12:03 PM","1:23 PM","",""],["United","UA2599","SEATTLE","A25","12:39 PM","1:24 PM","",""],["United","UA2345","Denver","A18","12:36 PM","1:26 PM","",""],["United","UA2605","San Antonio","A21","12:36 PM","1:26 PM","",""],["Alaska","B6750","Las Vegas","B17","12:36 PM","1:26 PM","",""],["Delta","DL897","Orlando","D16","12:51 PM","1:26 PM","",""],["Delta","DL2058","Dallas Fort Worth","D17","12:21 PM","1:26 PM","",""],["United","UA721","FORT LAUDERDALE","A22","12:27 PM","1:27 PM","",""],["Southwest","WN1299","ATLANTA","C7","1:37 PM","1:27 PM","",""],["Frontier","F9700","ORLANDO","D27","12:03 PM","1:28 PM","",""],["Southwest","WN3056","Baltimore","C16","12:31 PM","1:31 PM","",""],["Frontier","F93348","Grand Rapids","D24","12:36 PM","1:31 PM","",""],["United","UA2704","Cleveland","A16","12:21 PM","1:31 PM","",""],["Southwest","WN3516","Columbus","C13","1:06 PM","1:36 PM","",""],["Allegiant","G44651","Dayton","D38","12:36 PM","1:36 PM","",""],["American","AA1876","Washington DCA","B2","12:51 PM","1:36 PM","",""],["United","UA1867","NEWARK","A24","12:42 PM","1:37 PM","",""],["American","AA971","PHOENIX","B12","1:37 PM","1:37 PM","",""],["American","AA1744","TAMPA","B11","1:12 PM","2:17 PM","",""],["Delta","DL1509","Salt Lake City","D18","11:36 AM","1:41 PM","",""],["United","UA5224","SANTA FE","A6","1:52 PM","1:41 PM","",""],["Southwest","WN2375","Fort Lauderdale","C22","3:59 PM","5:09 PM","",""],["Delta","DL2489","ATLANTA","D17","3:13 PM","3:18 PM","",""],["Delta","DL805","PHILLDELPHIA","D2","3:18 PM","3:28 PM","",""],["United","UA5353","Birmingham","A7","2:36 PM","3:11 PM","",""],["United","UA1910","Cincinnati","A9","2:36 PM","3:16 PM","",""],["American","AA1163","Washington IAD","B7","2:36 PM","3:16 PM","",""],["Southwest","WN1394","Phoenix","C20","2:36 PM","3:16 PM","",""],["Delta","DL5645","Des Moines","D6","2:36 PM","4:06 PM","",""],["Southwest","WN2197","BALTIMORE","C17","2:47 PM","4:07 PM","",""],["American","AA670","SAN JOSE","B2","3:19 PM","3:19 PM","",""],["United","UA352","Denver","A5","2:42 PM","3:37 PM","",""],["American","AA2273","Boston","B5","3:18 PM","4:13 PM","",""],["United","UA2278","MINNEAPOLIS","A8","2:42 PM","3:17 PM","",""],["Delta","DL6707","KANSAS CITY","D10","3:54 PM","4:49 PM","",""],["Southwest","WN3975","Orlando","C12","1:02 PM","2:37 PM","",""],["United","UA2181","WASHINGTON IAD","A15","2:43 PM","3:38 PM","",""],["Southwest","WN3304","SEATTLE","C25","4:31 PM","5:41 PM","",""],["American","AA6308","Kansas City","B13","4:44 PM","5:44 PM","",""],["Frontier","F91162","Atlanta","D26","1:21 PM","2:41 PM","",""],["Southwest","WN4949","Savannah","C13","2:51 PM","3:31 PM","",""],["Allegiant","G4750","Peonia","D40","3:21 PM","3:41 PM","",""],["Delta","DL2842","Phoenix","D8","2:15 PM","2:45 PM","",""],["Southwest","WN214","BALTIMORE","C12","3:34 PM","4:44 PM","",""],["Delta","DL1136","Seattle","D14","2:56 PM","3:36 PM","",""],["American","AA534","MIAMI","B4","3:23 PM","4:13 PM","",""],["Southwest","WN485","Seattle- Portland","C1","2:25 PM","2:55 PM","",""],["Southwest","WN3158","Miami","C15","3:01 PM","3:31 PM","",""],["Delta","DL999","Atlanta","D19","3:01 PM","3:31 PM","",""],["Southwest","WN466","ATLANTA","C22","3:26 PM","2:56 PM","",""],["United","UA276","SALT LAKE CITY","A11","2:27 PM","2:57 PM","",""],["United","UA761","Milwaukee","A17","3:06 PM","3:36 PM","",""],["United","UA1754","Denver","A4","2:30 PM","3:00 PM","",""],["Delta","DL766","Boston","D16","2:30 PM","3:00 PM","",""],["Frontier","F92835","Philldelphia","D22","3:06 PM","3:36 PM","",""],["American","AA2063","Boston","B6","1:37 PM","3:02 PM","",""],["United","UA5634","LINCOLN","A25","3:57 PM","3:42 PM","",""],["BREEZE","GT5954","LAX","C28","2:36 PM","3:06 PM","",""],["Frontier","F9179","MIAMI","D21","3:57 PM","3:57 PM","",""],["Frontier","F92006","DENVER","D25","2:38 PM","3:08 PM","",""],["Frontier","F92216","PORTLAND","D25","2:42 PM","3:12 PM","",""],["United","UA2646","HOUSTON","A26","4:42 PM","3:12 PM","",""],["American","AA210","LOS ANGELES","B4","1:03 PM","3:13 PM","",""],["Southwest","WN1674","Albuquerque","C3","2:45 PM","3:15 PM","",""],["Delta","DL1598","Minneapolis","D7","2:45 PM","3:15 PM","",""],["Southwest","WN1854","Chicago Midway","C27","2:46 PM","3:16 PM","",""],["Southwest","WN2805","SAN JOSE","C2","2:27 PM","3:17 PM","",""],["Frontier","F9212","NEW ORLEANS","D27","1:12 PM","3:37 PM","",""],["Southwest","WN3263","Columbus","C24","2:47 PM","3:17 PM","",""],["American","AA4629","MEMPHIS","B3","2:42 PM","3:17 PM","",""],["Southwest","WN636","DENVER","C6","2:33 PM","3:18 PM","",""],["Southwest","WN5597","ALBANY","C5","2:38 PM","3:18 PM","",""],["Alaska","B61457","New York JFK","B17","2:50 PM","3:20 PM","",""],["American","AA5041","ALBANY","B6","4:42 PM","3:57 PM","",""],["United","UA5535","EL PASO","A27","2:52 PM","3:22 PM","",""],["United","UA1925","LOS ANGELES","A12","5:07 PM","3:22 PM","",""],["Southwest","WN4410","LITTLE ROCK","C8","3:02 PM","3:22 PM","",""],["Frontier","F91433","JACKSONVILLE","D22","2:52 PM","3:22 PM","",""],["Hawaiian","HA2608","MAUI","D43","2:42 PM","3:22 PM","",""],["United","UA2179","LAS VEGAS","A25","2:42 PM","3:27 PM","",""],["Southwest","WN5254","FRESNO","C11","4:48 PM","4:03 PM","",""],["United","UA158","SAN JOSE","A16","6:30 PM","4:05 PM","",""],["Delta","DL1187","Denver","D1","3:36 PM","4:06 PM","",""],["Avelo","XP397","Portland","A30","2:36 PM","3:31 PM","",""],["Avelo","XP685","Orlando","A29","2:51 PM","3:31 PM","",""],["Alaska","AS883","Seattle","B29","2:47 PM","3:37 PM","",""],["Southwest","WN3518","NEW YORK LAGUARDIA","C18","1:37 PM","3:32 PM","",""],["United","UA2379","LOS ANGELES","A19","2:27 PM","3:37 PM","",""],["Southwest","WN5188","FORT MYERS","C25","12:55 PM","3:35 PM","",""],["JETBLUE","B61124","PHX","B15","2:25 PM","3:35 PM","",""],["United","UA2284","Austin","A18","2:21 PM","3:36 PM","",""],["United","UA5479","Dayton","A3","2:21 PM","3:36 PM","",""],["Spirit","NK1976","Orlando","D31","2:42 PM","3:36 PM","",""],["AMERICAN","AA3192","DEN","B10","2:41 PM","3:36 PM","",""],["Delta","DL1340","CHICAGO MIDWAY","D13","2:51 PM","3:36 PM","",""],["Alaska","AS850","Seattle","B26","2:42 PM","3:36 PM","",""],["United","UA5539","VAIL","A14","2:42 PM","3:36 PM","",""],["Southwest","WN2804","Los Angeles","C12","2:51 PM","3:36 PM","",""],["United","UA5946","Des Moines","A13","3:06 PM","3:36 PM","",""],["United","UA1016","DETROIT","A23","3:06 PM","3:36 PM","",""],["Southwest","WN2592","ORLANDO","C21","3:28 PM","4:12 PM","",""],["Southwest","WN2243","Nashville","C18","2:21 PM","3:36 PM","",""],["United","UA5007","Casper","A20","2:21 PM","3:36 PM","",""],["Frontier","F91931","Denver","D24","2:42 PM","4:12 PM","",""],["Alaska","B62095","LAS VEGAS","B19","3:42 PM","4:12 PM","",""],["United","UA2281","Newark","A1","12:37 PM","3:37 PM","",""],["American","AA1080","Houston","B9","2:43 PM","4:13 PM","",""],["United","UA6067","Kansas City","A23","2:42 PM","3:37 PM","",""],["Southwest","WN5272","Memphis","C16","3:18 PM","4:13 PM","",""],["Southwest","WN116","Phoenix","C9","2:42 PM","3:37 PM","",""],["Delta","DL176","New York JFK","D17","4:24 PM","5:34 PM","",""],["American","AA1731","PHILADELPHIA","B12","2:42 PM","3:37 PM","",""],["Southwest","WN1593","Phoenix","C6","1:12 PM","3:37 PM","",""],["Hawaiian","HA2400","Kona","D42","2:47 PM","3:37 PM","",""],["Southwest","WN500","ORLANDO","C11","2:57 PM","3:37 PM","",""],["American","AA2582","LOS ANGELES","B11","2:47 PM","3:37 PM","",""],["United","UA2025","San Diego","A15","4:24 PM","5:54 PM","",""],["American","AA107","Charlotte","B1","1:37 PM","3:37 PM","",""],["Frontier","F92734","Miami","D20","1:37 PM","3:37 PM","",""],["Allegiant","G5228","Knoxville","D37","1:43 PM","4:28 PM","",""],["United","UA5361","AMARILLO","A6","2:42 PM","3:37 PM","",""],["Frontier","F9831","Las Vegas","D23","12:57 PM","3:37 PM","",""],["Southwest","WN893","Nashville","C7","2:43 PM","4:13 PM","",""],["Southwest","WN5478","Savannah","C10","2:43 PM","4:13 PM","",""],["Delta","DL1028","Phoenix","D15","1:07 PM","3:37 PM","",""],["Southwest","WN2578","Oakland","C4","1:07 PM","3:37 PM","",""],["United","UA592","HOUSTON","A26","5:04 PM","5:49 PM","",""],["United","UA2042","Burbank","A12","1:12 PM","3:37 PM","",""],["United","UA964","Seattle","A13","1:27 PM","3:37 PM","",""],["Southwest","WN4905","Palm Springs","C19","2:43 PM","4:13 PM","",""],["Southwest","WN2191","SEATTLE","C4","5:04 PM","5:54 PM","",""],["Delta","DL2118","Orlando","D11","1:07 PM","3:37 PM","",""],["Southwest","WN2936","Atlanta","C5","2:43 PM","4:13 PM","",""],["Delta","DL429","New York JFK","D14","4:19 PM","5:49 PM","",""],["Alaska","B62813","Los Angeles","B22","2:42 PM","3:37 PM","",""],["Frontier","F9349","Denver","D29","2:37 PM","3:37 PM","",""],["Southwest","WN2963","FORT LAUDERDALE","C23","2:57 PM","3:37 PM","",""],["Frontier","F92519","SEATTLE","D22","3:50 PM","5:20 PM","",""],["United","UA1707","ALBURQUERQUE","A26","4:04 PM","4:14 PM","",""],["American","AA2761","WASHINGTON DCA","B14","2:43 PM","3:38 PM","",""],["United","UA2154","Indianapolis","A22","2:48 PM","3:38 PM","",""],["Southwest","WN2223","OAKLAND","C2","3:24 PM","4:14 PM","",""],["Frontier","F91435","CLEVELAND","D25","2:18 PM","3:38 PM","",""],["American","AA1741","CHARLOTTE","B8","2:44 PM","4:14 PM","",""],["Southwest","WN1161","LAS VEGAS","C1","3:44 PM","5:14 PM","",""],["United","UA636","Tampa","A27","2:44 PM","4:14 PM","",""],["United","UA218","Miami","A24","2:44 PM","4:14 PM","",""],["Southwest","WN3374","PHILADELPHIA","C26","2:43 PM","3:38 PM","",""],["Spirit","NK1602","NEW ORLEANS","D35","1:13 PM","3:38 PM","",""],["Alaska","AS1405","PORTLAND","B27","1:13 PM","4:08 PM","",""],["Delta","DL2706","CHICAGO MIDWAY","D12","1:28 PM","3:38 PM","",""],["Alaska","AS2951","SAN DIEGO","B30","1:13 PM","3:38 PM","",""],["Frontier","F9620","SALT LAKE CITY","D28","1:49 PM","4:14 PM","",""],["American","AA2774","DALLAS","B7","3:59 PM","5:29 PM","",""],["United","UA2980","LOS ANGELES","A28","2:18 PM","3:38 PM","",""],["United","UA2849","SEATTLE","A14","4:20 PM","5:50 PM","",""],["American","AA5105","MEMPHIS","B13","3:43 PM","3:38 PM","",""],["Delta","DL2220","DETROIT","D9","1:43 AM","3:38 PM","",""],["American","AA1721","HONOLULU","B6","4:44 PM","5:29 PM","",""],["Southwest","WN4229","FRESNO","C15","4:20 PM","5:15 PM","",""],["Alaska","AS214","New York JFK","B25","2:47 PM","3:39 PM","",""],["Alaska","B62937","San Francisco","B20","2:21 PM","3:41 PM","",""],["Hawaiian","HA2786","Honolulu","D45","1:12 PM","3:42 PM","",""],["Delta","DL918","Detroit","D4","1:07 PM","3:42 PM","",""],["Hawaiian","HA1902","Maui","D44","2:42 PM","3:42 PM","",""],["FRONTIER","F91292","ORD","D29","4:24 PM","5:54 PM","",""],["American","AA4951","Charleston","B3","4:03 PM","5:33 PM","",""],["American","AA1404","BALTIMORE","B1","3:57 PM","3:42 PM","",""],["Spirit","NK2635","LAS VEGAS","D34","2:48 PM","3:43 PM","",""],["UNITED","UA4251","DEN","A20","3:05 PM","3:45 PM","",""],["United","UA5799","OKLAHOMA CITY","A21","3:51 PM","3:21 PM","",""],["SUN COUNTRY","GT8326","ATL","D41","5:27 PM","6:27 PM","",""],["Sun Country","SY661","Minneapolis","D41","8:58 PM","10:28 PM","",""],["UNITED","UA8351","ORD","A17","4:37 PM","5:07 PM","",""],["Delta","DL518","Honolulu","D5","1:22 PM","3:47 PM","",""],["Southwest","WN399","Burbank","C14","2:51 PM","3:50 PM","",""],["United","UA4888","CHEYENNE","A7","5:57 PM","5:17 PM","",""],["United","UA2971","CLEVELAND","A9","6:36 PM","3:51 PM","",""],["United","UA2611","Chicago O'Hare","A2","12:52 PM","3:52 PM","",""],["Delta","DL937","SEATTLE","D3","1:13 PM","3:53 PM","",""],["American","AA713","CHARLOTTE","B5","4:44 PM","5:44 PM","",""],["American","AA916","Orlando","B18","2:21 PM","3:56 PM","",""],["Alaska","AS477","LAS VEGAS","B28","3:21 PM","3:56 PM","",""],["United","UA5966","IDAHO FALLS","A22","3:27 PM","3:57 PM","",""],["Southwest","WN591","Boston","C24","1:23 PM","4:55 PM","",""],["UNITED","UA2381","SEA","A2","3:24 PM","3:59 PM","",""],["Alaska","B6147","WASHINGTON IAD","B19","4:06 PM","3:51 PM","",""],["Allegiant","G43969","Bozeman","D36","3:18 PM","4:28 PM","",""],["Southwest","WN1435","MINNEAPOLIS","C5","2:48 PM","4:03 PM","",""],["SUN COUNTRY","GT4234","PHX","D41","3:18 PM","4:03 PM","",""],["Allegiant","G4900","Aspen","D39","3:11 PM","4:06 PM","",""],["United","UA630","CHARLOTTE","A6","3:36 PM","4:06 PM","",""],["United","UA732","SAN DIEGO","A25","4:42 PM","5:12 PM","",""],["United","UA1829","CHICAGO O'HARE","A4","4:42 PM","5:12 PM","",""],["Southwest","WN306","DENVER","C20","5:27 PM","5:27 PM","",""],["Southwest","WN1483","Jacksonville","C8","1:27 PM","4:07 PM","",""],["American","AA905","Phoenix","B9","4:13 PM","5:43 PM","",""],["Breeze","MX1560","Las Vegas","C29","3:11 PM","4:11 PM","",""],["United","UA2868","Atlanta","A9","4:57 PM","5:32 PM","",""],["Spirit","NK1933","Fort Lauderdale","D30","3:12 PM","4:12 PM","",""],["United","UA4921","BOISE","A7","4:57 PM","4:12 PM","",""],["Spirit","NK662","ORLANDO","D32","3:37 PM","4:17 PM","",""],["Southwest","WN3717","Washington DCA","C21","2:47 PM","5:32 PM","",""],["HAWAIIAN","HA7876","ATL","D38","3:45 PM","4:20 PM","",""],["SUN COUNTRY","GT3886","ORD","D41","3:50 PM","4:20 PM","",""],["Delta","DL2968","Atlanta","D19","4:22 PM","5:12 PM","",""],["United","UA168","CLEVELAND","A21","3:51 PM","4:21 PM","",""],["United","UA2868","ATLANTA","A13","3:36 PM","4:21 PM","",""],["United","UA1159","Minneapolis","A26B","3:36 PM","4:21 PM","",""],["American","AA363","Dallas","B16","3:36 PM","4:21 PM","",""],["American","AA2198","PORTLAND","B2","3:36 PM","4:21 PM","",""],["American","AA562","Chicago O'Hare","B4","5:12 PM","5:57 PM","",""],["United","UA4537","Dodge City","A10","3:21 PM","4:21 PM","",""],["Frontier","F9396","Washington DCA","D28","4:27 PM","4:57 PM","",""],["Delta","DL2365","BOSTON","D7","5:12 PM","5:27 PM","",""],["United","UA1287","HOUSTON","A8","5:27 PM","5:27 PM","",""],["United","UA1167","SEATTLE","A18","5:12 PM","5:42 PM","",""],["Southwest","WN6255","KANSAS CITY","C21","5:12 PM","5:42 PM","",""],["United","UA2258","NEW ORLEANS","A1","16:06","4:21 PM","",""],["Southwest","WN332","ALBUQUERQUE","C3","5:43 PM","6:33 PM","",""],["United","UA4956","Memphis","A27","4:14 PM","5:44 PM","",""],["American","AA1208","Los Angeles","B14","5:16 PM","5:46 PM","",""],["Southwest","WN1521","Dallas Love Field","C6","5:16 PM","5:46 PM","",""],["United","UA1952","DENVER","A19","4:17 PM","5:47 PM","",""],["Frontier","F9843","Atlanta","D26","4:12 PM","5:02 PM","",""],["Alaska","AS916","HONOLULU","B24","2:13 PM","4:28 PM","",""],["United","UA2206","Sacramento","A16","5:06 PM","5:36 PM","",""],["Avelo","XP2762","Las Vegas","A29","5:21 PM","5:51 PM","",""],["Southwest","WN5115","Santa Fe","C10","5:21 PM","5:51 PM","",""],["Southwest","WN2796","ATLANTA","C3","5:57 PM","5:27 PM","",""],["Southwest","WN535","Dallas Love Field","C26","5:21 PM","5:51 PM","",""],["Delta","DL162","Los Angeles","D18","4:00 PM","4:30 PM","",""],["Spirit","NK372","Orlando","D33","3:56 PM","4:31 PM","",""],["Southwest","WN1085","PHOENIX","C11","4:03 PM","5:03 PM","",""],["Alaska","AS1036","San Diego","B23","3:36 PM","4:36 PM","",""],["Southwest","WN5368","Cheyenne","C7","4:57 PM","5:57 PM","",""],["United","UA1197","ANCHORAGE","A3","5:12 PM","5:42 PM","",""],["American","AA2846","HONOLULU","B3","7:57 PM","7:12 PM","",""],["Hawaiian","HA1870","Kona","D42","5:16 PM","5:46 PM","",""],["Alaska","B62127","NASHVILLE","B19","4:51 PM","5:21 PM","",""],["Southwest","WN1360","Indianapolis","C16","5:21 PM","5:51 PM","",""],["Southwest","WN926","CINCINNATI","C12","5:57 PM","6:21 PM","",""],["Southwest","WN1172","Houston Hobby","C8","5:42 PM","6:22 PM","",""],["Southwest","WN1489","HOUSTON HOBBY","C8","4:48 PM","6:08 PM","",""],["United","UA2175","PHOENIX","A11","3:42 PM","4:47 PM","",""],["Southwest","WN1439","Tampa","C21","5:52 PM","7:12 PM","",""],["Southwest","WN5062","DES MOINES","C22","5:12 PM","6:42 PM","",""],["Southwest","WN828","COLUMBUS","C7","6:57 PM","7:27 PM","",""],["Spirit","NK2275","ATLANTA","D34","4:21 PM","4:51 PM","",""],["Southwest","WN4522","ORANGE COUNTY","C1","7:27 PM","6:57 PM","",""],["Hawaiian","HA981","Honolulu","D45","5:31 PM","6:01 PM","",""],["United","UA2735","Jacksonville","A8","4:27 PM","4:57 PM","",""],["United","UA5382","ST. LOUIS","A8","5:06 PM","5:36 PM","",""],["United","UA4765","Norfolk","A5","5:21 PM","5:51 PM","",""],["United","UA322","Raleigh","A6","5:21 PM","5:51 PM","",""],["American","AA4906","Myrtle Beach","B12","4:30 PM","5:00 PM","",""],["Alaska","AS2704","Washington IAD","B26","5:06 PM","6:06 PM","",""],["Delta","DL672","Denver","D8","4:30 PM","5:00 PM","",""],["United","UA598","SAN JOSE","A24","4:39 PM","5:54 PM","",""],["Southwest","WN3545","Orlando","C16","6:49 PM","7:26 PM","",""],["American","AA4749","Flagstaff","B6","6:12 PM","7:12 PM","",""],["Allegiant","G4537","ASHEVILLE","D38","5:57 PM","6:27 PM","",""],["Hawaiian","HA2171","HONOLULU","D42","6:42 PM","7:27 PM","",""],["Frontier","F91484","AUSTIN","D21","4:42 PM","6:12 PM","",""],["United","UA2044","TAMPA","A12","5:27 PM","5:57 PM","",""],["Southwest","WN3454","MINNEAPOLIS","C26","6:57 PM","7:27 PM","",""],["Frontier","F91207","ORLANDO","D20","4:27 PM","5:57 PM","",""],["Delta","DL1660","Atlanta","D16","4:40 PM","5:10 PM","",""],["Allegiant","G44782","Palm Springs","D39","4:40 PM","5:10 PM","",""],["Delta","DL444","Chicago O'Hare","D13","3:36 PM","5:11 PM","",""],["Breeze","MK1811","Phoenix","C30","4:06 PM","5:11 PM","",""],["Delta","DL971","LOS ANGELES","D12","4:17 PM","5:47 PM","",""],["Alaska","AS467","NEW YORK JFK","B25","4:41 PM","5:11 PM","",""],["Allegiant","G929","Cincinnati","D40","4:18 PM","5:48 PM","",""],["Delta","DL2502","MINNEAPOLIS","D9","4:19 PM","5:49 PM","",""],["American","AA1254","Las Vegas","B2","4:45 PM","5:15 PM","",""],["Alaska","AS1092","Portland","B24","5:21 PM","6:36 PM","",""],["Frontier","F93092","Des Moines","D28","6:06 PM","6:36 PM","",""],["Frontier","F93600","Eugene","D27","4:45 PM","5:15 PM","",""],["Spirit","NK1981","Miami","D35","4:45 PM","5:15 PM","",""],["Delta","DL5918","Pittsburgh","D1","5:21 PM","5:51 PM","",""],["Frontier","F93289","St. Louis","D22","5:23 PM","6:53 PM","",""],["American","AA1926","Boston","B11","4:50 PM","5:20 PM","",""],["American","AA335","HONOLULU","B15","3:51 PM","5:21 PM","",""],["United","UA6024","Omaha","A9","4:06 PM","5:21 PM","",""],["Delta","DL850","New York JFK","D11","3:51 PM","5:21 PM","",""],["American","AA174","CHARLOTTE","B4","4:36 PM","5:21 PM","",""],["Delta","DL251","NASHVILLE","D4","4:36 PM","5:21 PM","",""],["Alaska","AS529","SEATTLE","B30","3:26 PM","5:21 PM","",""],["Delta","DL5909","EL PASO","D1","3:51 PM","5:21 PM","",""],["Spirit","NK1201","DALLAS FORT-WORTH","D31","3:51 PM","5:21 PM","",""],["Delta","DL1377","SALT LAKE CITY","D5","4:21 PM","5:21 PM","",""],["American","AA2655","DALLAS FORT WORTH","B13","3:36 PM","5:21 PM","",""],["United","UA1904","SACRAMENTO","A4","3:21 PM","5:21 PM","",""],["United","UA2357","DENVER","A19","4:51 PM","5:21 PM","",""],["Southwest","WN1577","NEW ORLEANS","C3","5:27 PM","6:45 AM","",""],["American","AA2015","AUSTIN","B5","4:22 PM","5:22 PM","",""],["HAWAIIAN","HA8126","DEN","D43","3:30 PM","5:25 PM","",""],["United","UA5245","Sun Valley","A17","5:26 PM","6:16 PM","",""],["Frontier","F9262","JACKSONVILLE","D21","4:12 PM","5:27 PM","",""],["American","AA1125","DENVER","B10","4:42 PM","5:27 PM","",""],["United","UA1235","BOSTON","A15","3:12 PM","5:27 PM","",""],["American","AA5559","CHARLESTON","B1","4:12 PM","5:27 PM","",""],["American","AA1503","CHARLOTTE","B6","5:42 PM","5:27 PM","",""],["United","UA1762","DALLAS FORT-WORTH","A3","3:36 PM","5:30 PM","",""],["Delta","DL1952","SALT LAKE CITY","D9","2:47 PM","5:30 PM","",""],["United","UA4502","El Paso","A24","5:00 PM","5:30 PM","",""],["Avelo","XP2044","Raleigh","A28","5:00 PM","5:30 PM","",""],["Southwest","WN4981","El Paso","C10","5:00 PM","5:30 PM","",""],["Southwest","WN443","Chicago Midway","C13","5:00 PM","5:30 PM","",""],["Frontier","F94977","St. Louis","D25","5:00 PM","5:30 PM","",""],["Hawaiian","HA1367","Maui","D44","5:00 PM","5:30 PM","",""],["Breeze","MX1242","Orlando","C27","5:05 PM","5:35 PM","",""],["United","UA4681","LITTLE ROCK","A18","3:51 PM","5:36 PM","",""],["United","UA2123","NASHVILLE","A2","5:42 PM","5:42 PM","",""],["United","UA2853","PORTLAND","A14","5:06 PM","5:36 PM","",""],["United","UA4764","Greensboro","A26","5:06 PM","5:36 PM","",""],["Southwest","WN4534","DES MOINES","C11","5:42 PM","6:42 PM","",""],["Frontier","F93624","ORANGE COUNTY","D28","4:21 PM","5:36 PM","",""],["Frontier","F91234","Charlotte","D24","2:47 PM","5:37 PM","",""],["Southwest","WN2787","Phoenix","C14","5:10 PM","5:40 PM","",""],["Southwest","WN5562","PALM SPRINGS","C17","5:11 PM","5:41 PM","",""],["Southwest","WN4371","ALBANY","C26","4:22 PM","5:42 PM","",""],["JETBLUE","B63694","BIRMINGHAM","B28","4:42 PM","5:42 PM","",""],["United","UA472","DENVER","A12","5:51 PM","5:51 PM","",""],["United","UA120","Detroit","A22","5:15 PM","5:45 PM","",""],["Delta","DL4911","Los Angleles","D10","5:15 PM","5:45 PM","",""],["Southwest","WN2172","TAMPA","C23","5:16 PM","5:46 PM","",""],["Southwest","WN4246","BOISE","C7","5:52 PM","7:07 PM","",""],["Southwest","WN1243","PHOENIX","C8","5:52 PM","7:37 PM","",""],["Southwest","WN1736","Los Angeles","C15","5:20 PM","5:50 PM","",""],["Delta","DL689","Seattle","D2","5:25 PM","5:50 PM","",""],["Southwest","WN2125","Atlanta- Richmond","C28","3:36 PM","5:51 PM","",""],["Frontier","F91842","RALEIGH","D20","3:51 PM","5:51 PM","",""],["Southwest","WN1201","LOS ANGELES","C22","5:21 PM","5:51 PM","",""],["Southwest","WN5006","Steamboat Springs","C4","5:25 PM","5:55 PM","",""],["Delta","DL841","ATLANTA","D3","5:26 PM","5:56 PM","",""],["United","UA6105","KANSAS CITY","A1","5:42 PM","5:57 PM","",""],["United","UA1053","Burbank","A20","5:30 PM","6:00 PM","",""],["Southwest","WN2498","Cincinnati","C19","5:30 PM","6:00 PM","",""],["Southwest","WN5973","Kansas City","C6","5:30 PM","6:00 PM","",""],["Delta","DL2267","San Francisco","D18","5:35 PM","6:05 PM","",""],["Delta","DL1213","HONOLULU","D15","3:36 PM","6:06 PM","",""],["United","UA859","SAN DIEGO","A21","5:21 PM","6:06 PM","",""],["United","UA5186","GRAND RAPIDS","A4","5:36 PM","6:06 PM","",""],["United","UA1710","Los Angeles","A13","4:51 PM","6:06 PM","",""],["United","UA1106","Las Vegas","A27","5:36 PM","6:06 PM","",""],["American","AA1425","DALLAS","B8","5:36 PM","6:06 PM","",""],["Frontier","F9241","PORTLAND","D23","5:36 PM","6:06 PM","",""],["Frontier","F91101","SEATTLE","D29","5:36 PM","6:06 PM","",""],["Southwest","WN1447","LAS VEGAS","C9","6:07 PM","6:07 PM","",""],["Alaska","AS735","Anchorage","B29","5:35 PM","6:07 PM","",""],["American","AA1435","Atlanta","B13","5:45 PM","6:15 PM","",""],["Southwest","WN2734","Orlando","C18","5:45 PM","6:15 PM","",""],["Southwest","WN4496","Colorado Springs","C3","6:21 PM","8:06 PM","",""],["Delta","DL1263","Philldelphia","D12","5:45 PM","6:15 PM","",""],["American","AA2793","MIAMI","B9","5:46 PM","6:16 PM","",""],["United","UA2167","BOSTON","A9","5:51 PM","6:21 PM","",""],["American","AA1958","BOSTON","B6","5:51 PM","6:21 PM","",""],["Delta","DL1116","BOSTON","D14","5:51 PM","6:21 PM","",""],["BREEZE","GT4359","DFW","C29","3:38 PM","6:23 PM","",""],["United","UA2669","Milwaukee","A15","6:00 PM","6:30 PM","",""],["United","UA1858","San Francisco","A23","6:00 PM","6:30 PM","",""],["United","UA279","Salt Lake City","A26B","6:00 PM","6:30 PM","",""],["United","UA5572","Eugene","A7","6:00 PM","6:30 PM","",""],["Southwest","WN2165","Baltimore","C21","6:00 PM","6:30 PM","",""],["Southwest","WN5909","Bozeman","C12","6:05 PM","6:35 PM","",""],["Frontier","F91757","LAS VEGAS","D22","5:06 PM","6:36 PM","",""],["United","UA849","ALBURQUERQUE","A8","5:36 PM","6:36 PM","",""],["United","UA6323","KANSAS CITY","A18","6:06 PM","6:36 PM","",""],["American","AA2994","BOSTON","B7","6:06 PM","6:36 PM","",""],["Southwest","WN4741","CHARLESTON","C5","6:06 PM","6:36 PM","",""],["Southwest","WN3429","Cleveland","C2","6:10 PM","6:40 PM","",""],["Southwest","WN114","ATLANTA","C25","6:11 PM","6:41 PM","",""],["Allegiant","G4532","Myrtle Beach","D40","6:15 PM","6:43 PM","",""],["United","UA6658","KANSAS CITY","A2","2:43 PM","6:45 PM","",""],["United","UA1041","San Francisco","A16","6:15 PM","6:45 PM","",""],["United","UA227","Houston","A26","6:15 PM","6:45 PM","",""],["United","UA448","Nashville","A5","6:15 PM","6:45 PM","",""],["American","AA2492","Phoenix","B12","6:15 PM","6:45 PM","",""],["American","AA2911","Houston","B2","6:15 PM","6:45 PM","",""],["Southwest","WN4285","Knoxville","C20","6:15 PM","6:45 PM","",""],["Southwest","WN1642","Las Vegas","C22","6:15 PM","6:45 PM","",""],["Southwest","WN2709","MIAMI","C1","6:51 PM","7:21 PM","",""],["Frontier","F92939","Charlotte","D20","6:15 PM","6:45 PM","",""],["Frontier","F92733","New Orleans","D21","6:15 PM","6:45 PM","",""],["Delta","DL2897","Minneapolis","D9","6:15 PM","6:45 PM","",""],["United","UA6829","SPRINGFIELD","A12","5:46 PM","6:46 PM","",""],["United","UA5721","SANTA FE","A3","6:16 PM","6:46 PM","",""],["Alaska","AS1948","Seattle","B27","6:25 PM","6:50 PM","",""],["American","AA2340","CHICAGO O'HARE","B3","5:36 PM","6:51 PM","",""],["Alaska","AS1346","LAS VEGAS","B28","6:42 PM","7:42 PM","",""],["United","UA5598","MEMPHIS","A1","6:21 PM","6:51 PM","",""],["Alaska","AS2124","PHOENIX","B23","6:57 PM","7:27 PM","",""],["Delta","DL6106","KANSAS CITY","D13","7:21 PM","6:51 PM","",""],["American","AA1178","MIAMI","B14","5:22 PM","6:52 PM","",""],["United","UA2104","Orlando","A27","6:30 PM","7:00 PM","",""],["Avelo","XP387","Las Vegas","A28","6:30 PM","7:00 PM","",""],["Alaska","B6177","Atlanta","B22","6:30 PM","7:00 PM","",""],["American","AA307","SAN FRANCISCO","B1","7:06 PM","7:06 PM","",""],["Southwest","WN113","LAS VEGAS","C16","7:06 PM","7:21 PM","",""],["Frontier","F94394","Sun Valley","D26","6:30 PM","7:00 PM","",""],["Spirit","NK6300","Kansas City","D35","6:30 PM","7:00 PM","",""],["Delta","DL2276","Seattle","D5","6:30 PM","7:00 PM","",""],["Delta","DL270","SALT LAKE CITY","D11","6:01 PM","7:01 PM","",""],["United","UA2160","SEATTLE","A25","7:11 PM","7:11 PM","",""],["Delta","DL2336","DETROIT","D1","4:51 PM","7:06 PM","",""],["Avelo","XP2428","Los Angeles","A29","6:36 PM","7:06 PM","",""],["Frontier","F94709","GRAND RAPIDS","D19","4:51 PM","7:06 PM","",""],["Delta","DL2679","LAS VEGAS","D7","6:06 PM","7:06 PM","",""],["United","UA1076","ORLANDO","A6","6:36 PM","7:06 PM","",""],["Southwest","WN4414","ST. LOUIS","C26","6:36 PM","7:06 PM","",""],["Frontier","F92675","SAN ANTONIO","D24","3:27 PM","7:12 PM","",""],["United","UA2040","Orlando","A22","6:45 PM","7:15 PM","",""],["Alaska","B62254","Jacksonville","B19","6:45 PM","7:15 PM","",""],["American","AA2292","MIAMI","B10","7:21 PM","7:21 PM","",""],["Southwest","WN1132","Washington DCA","C24","6:45 PM","7:15 PM","",""],["Southwest","WN3414","DENVER","C12","7:21 PM","5:36 PM","",""],["United","UA2148","PHILADELPHIA","A24","7:27 PM","6:57 PM","",""],["American","AA2552","HOUSTON","B5","6:51 PM","7:21 PM","",""],["Southwest","WN5932","Amarillo","C15","6:55 PM","7:25 PM","",""],["United","UA414","Washington IAD","A17","7:00 PM","7:30 PM","",""],["Alaska","B61061","Washington IAD","B16","7:00 PM","7:30 PM","",""],["Southwest","WN3829","Burbank","C13","7:00 PM","7:30 PM","",""],["Southwest","WN2900","Nashville","C4","7:00 PM","7:30 PM","",""],["Frontier","F92762","Las Vegas","D22","7:00 PM","7:30 PM","",""],["Delta","DL1045","Ancorage","D3","7:00 PM","7:30 PM","",""],["Spirit","NK1985","Las Vegas","D34","7:00 PM","7:30 PM","",""],["United","UA2634","Chicago O'Hare","A19","7:06 PM","7:36 PM","",""],["United","UA992","MIAMI","A8","7:06 PM","7:36 PM","",""],["American","AA2671","LOS ANGELES","B4","7:06 PM","7:36 PM","",""],["Southwest","WN3183","LOS ANGELES","C10","7:06 PM","7:36 PM","",""],["Delta","DL2665","WASHINGTON IAD","D6","7:06 PM","7:36 PM","",""],["United","UA2627","PHOENIX","A6","7:51 PM","6:06 PM","",""],["Southwest","WN2556","Raleigh","C19","7:15 PM","7:45 PM","",""],["Southwest","WN6206","KANSAS CITY","C7","7:51 PM","8:06 PM","",""],["Delta","DL291","Denver","D8","7:15 PM","7:45 PM","",""],["United","UA389","WASHINGTON IAD","A11","7:21 PM","7:51 PM","",""],["United","UA1523","AUSTIN","A2","7:21 PM","7:51 PM","",""],["American","AA476","WASHINGTON IAD","B14","7:21 PM","7:51 PM","",""],["Delta","DL370","INDIANAPOLIS","D16","7:21 PM","7:51 PM","",""],["American","AA1458","Chicago O'Hare","B11","7:25 PM","7:55 PM","",""],["Southwest","WN1140","LAS VEGAS","C11","8:01 PM","8:16 PM","",""],["American","AA404","Austin","B3","7:26 PM","7:56 PM","",""],["United","UA5494","Oklahoma City","A20","7:30 PM","8:00 PM","",""],["United","UA5050","Idaho Falls","A24","7:30 PM","8:00 PM","",""],["Avelo","XP507","Portland","A30","7:30 PM","8:00 PM","",""],["United","UA348","San Jose","A4","7:30 PM","8:00 PM","",""],["American","AA2768","Jacksonville","B1","7:30 PM","8:00 PM","",""],["Alaska","AS2938","Anchorage","B26","7:30 PM","8:00 PM","",""],["Delta","DL2425","Miami","D18","7:30 PM","8:00 PM","",""],["Frontier","F9646","Phoenix","D25","7:30 PM","8:00 PM","",""],["Frontier","F9151","Seattle","D29","7:30 PM","8:00 PM","",""],["Allegiant","G42075","Las Vegas","D39","8:00 PM","8:00 PM","",""],["Delta","DL1346","Salt Lake City","D4","7:30 PM","8:00 PM","",""],["Delta","DL2644","Cincinnati","D7","7:30 PM","8:00 PM","",""],["Alaska","AS6343","KANSAS CITY","B25","8:12 PM","8:57 PM","",""],["Southwest","WN5181","ALBANY","C8","8:12 PM","8:42 PM","",""],["Southwest","WN2916","NASHVILLE","C6","7:41 PM","8:11 PM","",""],["Southwest","WN1276","CHICAGO MIDWAY","C9","7:36 PM","8:11 PM","",""],["United","UA2008","Chicago ORD","A12","7:45 PM","8:15 PM","",""],["United","UA5451","Greensboro","A15","7:45 PM","8:15 PM","",""],["United","UA2349","Denver","A25","7:45 PM","8:15 PM","",""],["American","AA2935","Philadelphia","B10","7:45 PM","8:15 PM","",""],["Southwest","WN916","Denver","C22","7:45 PM","8:15 PM","",""],["Delta","DL991","Dallas Fort Worth","D17","7:45 PM","8:15 PM","",""],["Frontier","F92867","Denver","D20","7:45 PM","8:15 PM","",""],["Frontier","F92215","San Francisco","D23","7:45 PM","8:15 PM","",""],["Frontier","F92105","Atlanta","D24","7:45 PM","8:15 PM","",""],["Frontier","F91291","Tampa","D27","7:45 PM","8:15 PM","",""],["Sun Country","SY6384","Kansas City","D41","7:45 PM","8:15 PM","",""],["Southwest","WN2789","FORT LAUDERDALE","C1","7:46 PM","8:16 PM","",""],["American","AA1376","Miami","B7","7:50 PM","8:20 PM","",""],["United","UA1560","NEWARK","A13","7:51 PM","8:21 PM","",""],["Alaska","AS2800","HOUSTON","B29","7:51 PM","8:21 PM","",""],["Southwest","WN1180","ALBUQUERQUE","C16","7:51 PM","8:21 PM","",""],["Spirit","NK451","Orlando","D32","7:50 PM","8:25 PM","",""],["United","UA1684","Detroit","A10","8:00 PM","8:30 PM","",""],["United","UA4929","Cheyenne","A23","8:00 PM","8:30 PM","",""],["United","UA1200","Maui","A7","8:00 PM","8:30 PM","",""],["Alaska","B6171","New York JFK","B21","8:00 PM","8:30 PM","",""],["Southwest","WN4631","Pittsburgh","C12","8:00 PM","8:30 PM","",""],["Southwest","WN3854","Houston Hobby","C17","8:00 PM","8:30 PM","",""],["Southwest","WN3973","Albuquerque","C21","8:00 PM","8:30 PM","",""],["Breeze","MK1940","San Diego","C27","8:00 PM","8:30 PM","",""],["Delta","DL1286","Boston","D13","8:00 PM","8:30 PM","",""],["Delta","DL1979","Boston","D2","8:00 PM","8:30 PM","",""],["Frontier","F93156","St. Louis","D21","8:00 PM","8:30 PM","",""],["Allegiant","G2175","Cincinnati","D37","8:00 PM","8:30 PM","",""],["Allegiant","G44679","Colorado Springs","D38","8:00 PM","8:30 PM","",""],["United","UA1040","SEATTLE","A9","8:02 PM","8:32 PM","",""],["JETBLUE","B6446","LOS ANGELES","B17","8:38 PM","9:08 PM","",""],["Southwest","WN326","NEW YORK LAGUARDIA","C14","8:06 PM","8:36 PM","",""],["Southwest","WN2852","BOSTON","C18","8:06 PM","8:36 PM","",""],["United","UA469","DALLAS FORT-WORTH","A10","8:51 PM","7:36 PM","",""],["Frontier","F94190","Orange County","D26","8:15 PM","8:45 PM","",""],["Southwest","WN1695","DETROIT","C2","8:16 PM","8:46 PM","",""],["United","UA585","NEWARK","A5","8:21 PM","8:51 PM","",""],["Southwest","WN1971","OAKLAND","C20","8:21 PM","8:51 PM","",""],["Southwest","WN645","COLUMBUS","C23","8:21 PM","8:51 PM","",""],["United","UA2183","PORTLAND","A14","9:06 PM","8:21 PM","",""],["United","UA1245","Jacksonville","A27","8:30 PM","9:00 PM","",""],["Southwest","WN6030","Kansas City","C3","8:30 PM","9:00 PM","",""],["Delta","DL643","Nashville","D10","8:30 PM","9:00 PM","",""],["Delta","DL2571","Los Angeles","D19","8:30 PM","9:00 PM","",""],["American","AA2037","DALLAS","B6","8:36 PM","9:06 PM","",""],["Southwest","WN405","SALT LAKE CITY","C7","8:36 PM","9:06 PM","",""],["Southwest","WN2503","ORLANDO","C11","8:41 PM","9:11 PM","",""],["Avelo","XP1714","Raleigh","A28","8:45 PM","9:15 PM","",""],["United","UA2139","Austin","A3","8:45 PM","9:15 PM","",""],["American","AA1595","Tampa","B12","8:45 PM","9:15 PM","",""],["Delta","DL1047","Cincinnati","D15","8:45 PM","9:15 PM","",""],["United","UA4790","DES MOINES","A14","8:51 PM","9:21 PM","",""],["United","UA2246","LOS ANGELES","A2","8:51 PM","9:21 PM","",""],["United","UA1640","NASHVILLE","A8","9:36 PM","10:06 PM","",""],["United","UA1457","Chicago ORD","A16","9:00 PM","9:30 PM","",""],["United","UA5204","Palm Springs","A18","9:00 PM","9:30 PM","",""],["United","UA676","Charlotte","A22","9:00 PM","9:30 PM","",""],["United","UA1804","Newark","A26","9:00 PM","9:30 PM","",""],["United","UA595","San Francisco","A6","9:00 PM","9:30 PM","",""],["American","AA201","Philadelphia","B13","9:00 PM","9:30 PM","",""],["American","AA751","Boston","B5","9:00 PM","9:30 PM","",""],["American","AA114","Chicago O'Hare","B8","9:00 PM","9:30 PM","",""],["Southwest","WN1429","Austin","C10","9:00 PM","9:30 PM","",""],["Southwest","WN107","Detroit","C25","9:00 PM","9:30 PM","",""],["Delta","DL5506","El Paso","D1","9:00 PM","9:30 PM","",""],["Frontier","F91946","Salt Lake City","D22","9:00 PM","9:30 PM","",""],["Spirit","NK1336","Miami","D35","9:00 PM","9:30 PM","",""],["Allegiant","G41760","Burbank","D36","9:00 PM","9:30 PM","",""],["Southwest","WN1327","MILWAUKEE","C24","9:01 PM","9:31 PM","",""],["Southwest","WN703","NEW ORLEANS","C15","9:06 PM","9:36 PM","",""],["Spirit","NK2687","BALTIMORE","D30","9:06 PM","9:36 PM","",""],["Alaska","AS1485","Houston","B26","9:15 PM","9:45 PM","",""],["Southwest","WN2387","HOUSTON HOBBY","C13","9:16 PM","9:46 PM","",""],["United","UA2201","CINCINNATI","A1","9:21 PM","9:51 PM","",""],["Southwest","WN2980","MINNEAPOLIS","C19","9:21 PM","9:51 PM","",""],["Southwest","WN1572","DALLAS LOVE FIELD","C8","9:27 PM","9:57 PM","",""],["United","UA4633","Lincoln","A12","9:30 PM","10:00 PM","",""],["United","UA1624","Boston","A20","9:30 PM","10:00 PM","",""],["Avelo","XP2513","Orlando","A29","9:30 PM","10:00 PM","",""],["Alaska","B6901","Tampa","B19","9:30 PM","10:00 PM","",""],["Alaska","AS1731","Portland","B25","9:30 PM","10:00 PM","",""],["Southwest","WN4999","Orange County","C4","9:30 PM","10:00 PM","",""],["Spirit","NK1137","Fort Lauderdale","D31","9:30 PM","10:00 PM","",""],["Delta","DL148","Chicago O'Hare","D5","9:30 PM","10:00 PM","",""],["United","UA2010","LOS ANGELES","A11","9:36 PM","10:06 PM","",""],["United","UA1394","NEWARK","A17","9:36 PM","10:06 PM","",""],["United","UA4785","DAYTON","A24","9:36 PM","10:06 PM","",""],["United","UA2091","ORLANDO","A4","9:36 PM","10:06 PM","",""],["Frontier","F92891","SAN ANTONIO","D25","9:36 PM","10:06 PM","",""],["United","UA1249","New Orleans","A15","9:45 PM","10:15 PM","",""],["American","AA1577","Fort Lauderdale","B11","9:45 PM","10:15 PM","",""],["Alaska","B61853","Washington IAD","B15","9:45 PM","10:15 PM","",""],["Alaska","B61227","Miami","B20","9:45 PM","10:15 PM","",""],["Southwest","WN2811","Chicago Midway","C9","9:45 PM","10:15 PM","",""],["United","UA1666","SALT LAKE CITY","A21","9:51 PM","10:21 PM","",""],["United","UA1886","Las Vegas","A9","10:00 PM","10:30 PM","",""],["American","AA5084","Greensboro","B1","10:00 PM","10:30 PM","",""],["Alaska","B62700","San Francisco","B22","10:00 PM","10:30 PM","",""],["Frontier","F93510","St. Louis","D28","10:00 PM","10:30 PM","",""],["Delta","DL709","Boston","D3","10:00 PM","10:30 PM","",""],["Alaska","AS591","SEATTLE","B29","10:06 PM","10:36 PM","",""],["Southwest","WN1709","INDIANAPOLIS","C22","10:06 PM","10:36 PM","",""],["Frontier","F91287","SAN ANTONIO","D21","10:06 PM","10:36 PM","",""],["Southwest","WN5859","Kansas City","C2","10:15 PM","10:45 PM","",""],["United","UA516","NASHVILLE","A23","10:21 PM","10:51 PM","",""],["American","AA412","WASHINGTON IAD","B10","10:21 PM","10:51 PM","",""],["Southwest","WN4305","CHEYENNE","C21","10:21 PM","10:51 PM","",""],["Avelo","XP2349","Baltimore","A28","10:30 PM","11:00 PM","",""],["Alaska","AS2684","Las Vegas","B27","10:30 PM","11:00 PM","",""],["United","UA6846","KANSAS CITY","A27","10:36 PM","11:06 PM","",""],["United","UA1392","SACRAMENTO","A5","10:36 PM","11:06 PM","",""],["Southwest","WN877","NEW YORK LAGUARDIA","C7","11:12 PM","11:42 PM","",""],["Allegiant","G44988","FORT MYERS","D38","10:36 PM","11:06 PM","",""],["Allegiant","G5044","Reno","D39","10:36 PM","11:06 PM","",""],["United","UA1978","NASHVILLE","A26","10:42 PM","11:12 PM","",""],["United","UA430","SEATTLE","A2","11:21 PM","11:51 PM","",""],["United","UA4916","Des Moines","A19","10:45 PM","11:15 PM","",""],["Southwest","WN302","Albuquerque","C14","10:45 PM","11:15 PM","",""],["American","AA5264","CHARLESTON","B3","10:51 PM","11:21 PM","",""],["United","UA300","Jacksonville","A7","11:00 PM","11:30 PM","",""],["Alaska","B61946","Washington IAD","B16","11:00 PM","11:30 PM","",""],["Delta","DL667","Ancorage","D1","11:00 PM","11:30 PM","",""],["Delta","DL2618","Nashville","D11","11:00 PM","11:30 PM","",""],["Frontier","F96386","Kansas City","D23","11:00 PM","11:30 PM","",""],["United","UA2369","INDIANAPOLIS","A16","11:06 PM","11:36 PM","",""],["Spirit","NK6619","KANSAS CITY","D34","11:06 PM","11:36 PM","",""],["United","UA2034","Houston","A25","11:15 PM","11:45 PM","",""],["Southwest","WN1799","Raleigh","C19","11:15 PM","11:45 PM","",""],["Delta","DL621","Denver","D2","11:15 PM","11:45 PM","",""],["Allegiant","G4799","Las Vegas","D36","11:15 PM","11:45 PM","",""],["Alaska","B61319","Tampa","B20","11:30 PM","11:59 PM","",""],["Alaska","AS1254","Seattle","B28","11:30 PM","11:59 PM","",""],["JETBLUE","B67347","PHX","B21","3:15 PM","3:45 PM","",""],["AMERICAN","AA4549","DFW","B9","6:43 PM","7:13 PM","",""]];


function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : 'list';
    ensureSystemReady();

    if (action === 'list') return jsonResponse(getAllRowsWithBaseline());

    if (action === 'upsert') {
      if (!e.parameter.row) throw new Error('Missing row data.');
      const row = JSON.parse(e.parameter.row);
      const id = upsertRow(row);
      SpreadsheetApp.flush();
      return jsonResponse({ ok: true, id, row: getRowById(id) });
    }

    if (action === 'bulkUpdate') {
      if (!e.parameter.rows) throw new Error('Missing rows data.');
      const rows = JSON.parse(e.parameter.rows);
      const result = bulkUpdateExistingRows(rows);
      SpreadsheetApp.flush();
      return jsonResponse({ ok: true, updated: result.updated, failed: result.failed, errors: result.errors });
    }

    if (action === 'delete') {
      if (!e.parameter.id) throw new Error('Missing flight ID.');
      deleteRowById(e.parameter.id);
      return jsonResponse({ ok: true });
    }

    if (action === 'reset') {
      const carryovers = e.parameter.carryovers ? JSON.parse(e.parameter.carryovers) : [];
      resetOperationalSheet(carryovers);
      return jsonResponse({ ok: true, rows: getAllRowsWithBaseline() });
    }

    if (action === 'refreshBaseline') {
      throw new Error('The standard schedule is protected and cannot be replaced from live simulation data.');
    }

    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  try {
    ensureSystemReady();
    const body = JSON.parse(e.postData.contents || '{}');

    if (body.action === 'upsert') {
      const id = upsertRow(body.row);
      SpreadsheetApp.flush();
      return jsonResponse({ ok: true, id, row: getRowById(id) });
    }
    if (body.action === 'bulkUpdate') {
      const result = bulkUpdateExistingRows(body.rows || []);
      SpreadsheetApp.flush();
      return jsonResponse({ ok: true, updated: result.updated, failed: result.failed, errors: result.errors });
    }
    if (body.action === 'delete') {
      deleteRowById(body.id);
      return jsonResponse({ ok: true });
    }
    if (body.action === 'list') return jsonResponse(getAllRowsWithBaseline());
    if (body.action === 'reset') {
      resetOperationalSheet(body.carryovers || []);
      return jsonResponse({ ok: true, rows: getAllRowsWithBaseline() });
    }
    if (body.action === 'refreshBaseline') {
      throw new Error('The standard schedule is protected and cannot be replaced from live simulation data.');
    }

    return jsonResponse({ error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonResponse({ error: err && err.message ? err.message : String(err) });
  }
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function getLiveSheet() {
  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No tab named "' + SHEET_NAME + '" found.');
  return sheet;
}

function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
}

function ensureSystemReady() {
  const sheet = getLiveSheet();
  ensureSchema(sheet);
  // Existing rows can be addressed safely by synthetic row_N keys when the
  // hidden GATEOPS ID column is blank, so loading/saving no longer depends on
  // writing hundreds of IDs first.
  removeDuplicateRowsById(sheet);
  ensureBaselineExists();
}

function ensureSchema(sheet) {
  let headers = getHeaders(sheet);
  EXTRA_COLUMNS.forEach(header => {
    if (!headers.includes(header)) {
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(header);
      headers.push(header);
    }
  });

  const idIndex = headers.indexOf(ID_COLUMN) + 1;
  if (idIndex > 0) {
    try { sheet.hideColumns(idIndex); } catch (_) {}
  }
}

function ensureIds(sheet) {
  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf(ID_COLUMN);
  if (idIndex === -1) throw new Error('Required column "' + ID_COLUMN + '" is missing.');

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return;

  // Read all existing rows so ID repair does not depend on one particular
  // header spelling. Any non-empty existing row gets a durable ID.
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idValues = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  let changed = false;

  for (let i = 0; i < values.length; i++) {
    const rowHasData = values[i].some((value, colIndex) => {
      // Ignore the ID column itself when deciding whether this is a real row.
      if (colIndex === idIndex) return false;
      return String(value ?? '').trim() !== '';
    });
    if (rowHasData && !String(idValues[i][0] || '').trim()) {
      idValues[i][0] = Utilities.getUuid();
      changed = true;
    }
  }

  // Only write the hidden ID column. Existing schedule/image/formula cells
  // are never rewritten by this repair.
  if (changed) {
    sheet.getRange(2, idIndex + 1, idValues.length, 1).setValues(idValues);
    SpreadsheetApp.flush();
  }
}

function removeDuplicateRowsById(sheet) {
  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf(ID_COLUMN);
  if (idIndex === -1) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;

  const ids = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  const seen = new Set();
  const duplicateRows = [];
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0] || '').trim();
    if (!id) continue;
    if (seen.has(id)) duplicateRows.push(i + 2);
    else seen.add(id);
  }

  // Delete bottom-up so row numbers remain valid. The first occurrence is
  // authoritative because all normal upserts update that row in place.
  for (let i = duplicateRows.length - 1; i >= 0; i--) {
    sheet.deleteRow(duplicateRows[i]);
  }
}

function ensureBaselineExists() {
  const ss = getSpreadsheet();
  let standard = ss.getSheetByName(BASELINE_SHEET_NAME);

  // If this protected standard already exists with the correct embedded
  // version and row count, leave it completely untouched.
  if (standard) {
    const props = PropertiesService.getScriptProperties();
    const version = props.getProperty('GATEOPS_STANDARD_VERSION');
    if (version === STANDARD_VERSION && standard.getLastRow() === STANDARD_FLIGHTS.length + 1) {
      try { standard.hideSheet(); } catch (_) {}
      return;
    }
    // Rebuild only the protected reference sheet when the embedded standard
    // version changes. Never use live data as the source.
    standard.clear();
  } else {
    standard = ss.insertSheet(BASELINE_SHEET_NAME);
  }

  standard.getRange(1, 1, 1, STANDARD_HEADERS.length).setValues([STANDARD_HEADERS]);
  if (STANDARD_FLIGHTS.length) {
    standard.getRange(2, 1, STANDARD_FLIGHTS.length, STANDARD_HEADERS.length).setValues(STANDARD_FLIGHTS);
  }

  // Make the reference visibly/read-only protected against accidental edits.
  try {
    const existing = standard.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    existing.forEach(p => { try { p.remove(); } catch (_) {} });
    const protection = standard.protect().setDescription('Gate Ops protected standard schedule');
    try {
      const me = Session.getEffectiveUser();
      protection.addEditor(me);
      protection.removeEditors(protection.getEditors().filter(e => e.getEmail() !== me.getEmail()));
    } catch (_) {}
    try { if (protection.canDomainEdit()) protection.setDomainEdit(false); } catch (_) {}
  } catch (_) {}

  PropertiesService.getScriptProperties().setProperty('GATEOPS_STANDARD_VERSION', STANDARD_VERSION);
  try { standard.hideSheet(); } catch (_) {}
}

function refreshBaselineFromLive() {
  throw new Error('Protected standard schedule cannot be refreshed from live data.');
}

function readRows(sheet) {
  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .map((row, index) => {
      if (!row.some(v => String(v).trim() !== '')) return null;
      const obj = {};
      headers.forEach((header, i) => obj[header] = formatCell(row[i]));
      obj.__ROW_NUMBER = index + 2;
      // If the hidden durable ID is blank, expose a synthetic key tied to this
      // existing row. It can update the row but can never create a new one.
      if (!String(obj[ID_COLUMN] || '').trim()) obj[ID_COLUMN] = `row_${index + 2}`;
      return obj;
    })
    .filter(Boolean);
}

function getAllRowsWithBaseline() {
  const liveRows = readRows(getLiveSheet());
  const standardSheet = getSpreadsheet().getSheetByName(BASELINE_SHEET_NAME);
  const standardRows = standardSheet ? readRows(standardSheet) : [];

  // Match by flight-number occurrence. Flight number is protected/static;
  // gate/time/status/comments are allowed to change during the simulation.
  const standardByFlight = new Map();
  standardRows.forEach(row => {
    const key = String(row['FLIGHT NUMBER'] || '').trim().toUpperCase();
    if (!key) return;
    if (!standardByFlight.has(key)) standardByFlight.set(key, []);
    standardByFlight.get(key).push(row);
  });

  const usedCounts = new Map();

  return liveRows.map(row => {
    const key = String(row['FLIGHT NUMBER'] || '').trim().toUpperCase();
    const occurrence = usedCounts.get(key) || 0;
    usedCounts.set(key, occurrence + 1);
    const candidates = standardByFlight.get(key) || [];
    const base = candidates[occurrence] || null;

    return Object.assign({}, row, {
      __BASE_GATE: base ? base['GATE:'] : null,
      __BASE_BOARDING: base ? base['BOARDING TIME:'] : null,
      __BASE_DEPARTURE: base ? base['DEPARTURE TIME:'] : null,
      __BASE_STATUS: base ? (base['STATUS:'] || 'ON TIME') : null,
      __BASE_COMMENTS: base ? (base['COMMENTS'] || '') : null,
      __BASE_GATE_START: '',
      __IS_BASELINE: !!base,
    });
  });
}

function formatCell(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'h:mm a');
  }
  return value;
}

function findRowIndexById(sheet, id) {
  const rawId = String(id || '').trim();

  // Synthetic row key fallback for existing rows whose GATEOPS ID is blank.
  const rowMatch = /^row_(\d+)$/.exec(rawId);
  if (rowMatch) {
    const rowNumber = Number(rowMatch[1]);
    if (Number.isInteger(rowNumber) && rowNumber >= 2 && rowNumber <= sheet.getLastRow()) {
      return rowNumber;
    }
    return -1;
  }

  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf(ID_COLUMN);
  if (idIndex === -1) throw new Error('Column "' + ID_COLUMN + '" was not found.');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === rawId) return i + 2;
  }
  return -1;
}


function getRowById(id) {
  const sheet = getLiveSheet();
  const rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) throw new Error('Could not verify updated row for GATEOPS ID "' + id + '".');
  const headers = getHeaders(sheet);
  const values = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const obj = {};
  headers.forEach((header, i) => obj[header] = formatCell(values[i]));
  if (!String(obj[ID_COLUMN] || '').trim()) obj[ID_COLUMN] = String(id);
  obj.__ROW_NUMBER = rowIndex;
  return obj;
}

function upsertRow(rowObj) {
  if (!rowObj || typeof rowObj !== 'object') throw new Error('Invalid row data.');
  const sheet = getLiveSheet();
  const headers = getHeaders(sheet);

  const id = String(rowObj[ID_COLUMN] || rowObj.id || '').trim();
  if (!id) throw new Error('Missing GATEOPS ID. New flight rows are not allowed.');

  const rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) {
    throw new Error('Unknown GATEOPS ID "' + id + '". New flight rows are not allowed; only existing rows may be updated.');
  }

  const allowedHeaders = ['GATE:', 'BOARDING TIME:', 'DEPARTURE TIME:', 'STATUS:', 'COMMENTS', 'GATE BLOCK START:', 'DELAY TAG:'];
  allowedHeaders.forEach(header => {
    if (!Object.prototype.hasOwnProperty.call(rowObj, header)) return;
    const columnIndex = headers.indexOf(header);
    if (columnIndex === -1) return;
    sheet.getRange(rowIndex, columnIndex + 1).setValue(rowObj[header]);
  });

  return id;
}

function bulkUpdateExistingRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid rows data.');

  const sheet = getLiveSheet();
  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { updated: 0, failed: 0, errors: [] };

  const allowedHeaders = [
    'GATE:',
    'BOARDING TIME:',
    'DEPARTURE TIME:',
    'STATUS:',
    'COMMENTS',
    'GATE BLOCK START:',
    'DELAY TAG:'
  ];

  const allowedIndexes = {};
  allowedHeaders.forEach(header => {
    const idx = headers.indexOf(header);
    if (idx !== -1) allowedIndexes[header] = idx;
  });

  const allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const touchedRows = new Set();
  let updated = 0;
  let failed = 0;
  const errors = [];

  rows.forEach(rowObj => {
    try {
      if (!rowObj || typeof rowObj !== 'object') throw new Error('Invalid row data.');
      const id = String(rowObj[ID_COLUMN] || rowObj.id || '').trim();
      if (!id) throw new Error('Missing GATEOPS ID.');

      const rowIndex = findRowIndexById(sheet, id);
      if (rowIndex === -1) throw new Error('Unknown GATEOPS ID "' + id + '".');

      const arrayIndex = rowIndex - 2;
      Object.keys(allowedIndexes).forEach(header => {
        if (!Object.prototype.hasOwnProperty.call(rowObj, header)) return;
        allValues[arrayIndex][allowedIndexes[header]] = rowObj[header];
      });

      touchedRows.add(rowIndex);
      updated++;
    } catch (err) {
      failed++;
      if (errors.length < 10) errors.push(err && err.message ? err.message : String(err));
    }
  });

  // Write only the operational columns, one column at a time, across touched row ranges.
  // This avoids rewriting static roster/image/formula columns like AAAAIRLINE.
  if (touchedRows.size) {
    const sortedRows = Array.from(touchedRows).sort((a, b) => a - b);

    Object.keys(allowedIndexes).forEach(header => {
      const colIndex = allowedIndexes[header];
      let rangeStart = null;
      let previous = null;

      function flushRange(startRow, endRow) {
        if (startRow === null) return;
        const values = [];
        for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
          values.push([allValues[rowNum - 2][colIndex]]);
        }
        sheet.getRange(startRow, colIndex + 1, values.length, 1).setValues(values);
      }

      sortedRows.forEach(rowNum => {
        if (rangeStart === null) {
          rangeStart = rowNum;
          previous = rowNum;
          return;
        }
        if (rowNum === previous + 1) {
          previous = rowNum;
          return;
        }
        flushRange(rangeStart, previous);
        rangeStart = rowNum;
        previous = rowNum;
      });
      flushRange(rangeStart, previous);
    });
  }

  return { updated, failed, errors };
}


function deleteRowById(id) {
  if (!id) throw new Error('Missing flight ID.');
  const sheet = getLiveSheet();
  const rowIndex = findRowIndexById(sheet, id);
  if (rowIndex !== -1) sheet.deleteRow(rowIndex);
}

function resetOperationalSheet(carryovers) {
  const live = getLiveSheet();
  const standardSheet = getSpreadsheet().getSheetByName(BASELINE_SHEET_NAME);
  if (!standardSheet) throw new Error('Protected standard schedule is missing.');

  const headers = getHeaders(live);
  const liveRows = readRows(live);
  const standardRows = readRows(standardSheet);

  const standardByFlight = new Map();
  standardRows.forEach(row => {
    const key = String(row['FLIGHT NUMBER'] || '').trim().toUpperCase();
    if (!key) return;
    if (!standardByFlight.has(key)) standardByFlight.set(key, []);
    standardByFlight.get(key).push(row);
  });

  const usedCounts = new Map();
  const resetHeaders = ['AIRLINE','FLIGHT NUMBER','TO:','GATE:','BOARDING TIME:','DEPARTURE TIME:','STATUS:','COMMENTS','GATE BLOCK START:','DELAY TAG:'];

  liveRows.forEach(liveRow => {
    const key = String(liveRow['FLIGHT NUMBER'] || '').trim().toUpperCase();
    if (!key) return;

    const occurrence = usedCounts.get(key) || 0;
    usedCounts.set(key, occurrence + 1);
    const candidates = standardByFlight.get(key) || [];
    const standard = candidates[occurrence];
    if (!standard) return; // update-only: never create a missing roster row

    const rowIndex = Number(liveRow.__ROW_NUMBER);
    if (!Number.isInteger(rowIndex) || rowIndex < 2) return;

    const desired = {
      'AIRLINE': standard['AIRLINE'] || '',
      'FLIGHT NUMBER': standard['FLIGHT NUMBER'] || '',
      'TO:': standard['TO:'] || '',
      'GATE:': standard['GATE:'] || '',
      'BOARDING TIME:': standard['BOARDING TIME:'] || '',
      'DEPARTURE TIME:': standard['DEPARTURE TIME:'] || '',
      'STATUS:': standard['STATUS:'] || 'ON TIME',
      'COMMENTS': standard['COMMENTS'] || '',
      'GATE BLOCK START:': '',
      'DELAY TAG:': ''
    };

    // Preserve AAAAIRLINE/image/formula and GATEOPS ID columns.
    resetHeaders.forEach(header => {
      const col = headers.indexOf(header);
      if (col === -1) return;
      live.getRange(rowIndex, col + 1).setValue(desired[header]);
    });
  });

  SpreadsheetApp.flush();

  // Carryovers may update an already-existing row only; never append.
  (carryovers || []).forEach(row => {
    const copy = Object.assign({}, row);
    const id = String(copy[ID_COLUMN] || copy.id || '').trim();
    if (!id) return;
    if (findRowIndexById(live, id) === -1) return;
    copy[ID_COLUMN] = id;
    upsertRow(copy);
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
