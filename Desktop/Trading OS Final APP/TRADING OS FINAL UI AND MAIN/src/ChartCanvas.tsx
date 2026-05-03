export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

const candleData: Candle[] = [
  { time: '2024-10-01', open: 1.1040, high: 1.1080, low: 1.1020, close: 1.1060 },
  { time: '2024-10-02', open: 1.1060, high: 1.1100, low: 1.1045, close: 1.1085 },
  { time: '2024-10-03', open: 1.1085, high: 1.1060, low: 1.1030, close: 1.1040 },
  { time: '2024-10-04', open: 1.1040, high: 1.1050, low: 1.1010, close: 1.1020 },
  { time: '2024-10-07', open: 1.1020, high: 1.1040, low: 1.1000, close: 1.1030 },
  { time: '2024-10-08', open: 1.1030, high: 1.1050, low: 1.1015, close: 1.1045 },
  { time: '2024-10-09', open: 1.1045, high: 1.1060, low: 1.1030, close: 1.1055 },
  { time: '2024-10-10', open: 1.1055, high: 1.1080, low: 1.1040, close: 1.1070 },
  { time: '2024-10-11', open: 1.1070, high: 1.1050, low: 1.1020, close: 1.1030 },
  { time: '2024-10-14', open: 1.1030, high: 1.1010, low: 1.0980, close: 1.0990 },
  { time: '2024-10-15', open: 1.0990, high: 1.0970, low: 1.0940, close: 1.0950 },
  { time: '2024-10-16', open: 1.0950, high: 1.0980, low: 1.0930, close: 1.0970 },
  { time: '2024-10-17', open: 1.0970, high: 1.0990, low: 1.0950, close: 1.0980 },
  { time: '2024-10-18', open: 1.0980, high: 1.0960, low: 1.0930, close: 1.0940 },
  { time: '2024-10-21', open: 1.0940, high: 1.0920, low: 1.0890, close: 1.0900 },
  { time: '2024-10-22', open: 1.0900, high: 1.0930, low: 1.0880, close: 1.0920 },
  { time: '2024-10-23', open: 1.0920, high: 1.0950, low: 1.0900, close: 1.0940 },
  { time: '2024-10-24', open: 1.0940, high: 1.0970, low: 1.0920, close: 1.0960 },
  { time: '2024-10-25', open: 1.0960, high: 1.0980, low: 1.0940, close: 1.0970 },
  { time: '2024-10-28', open: 1.0970, high: 1.0990, low: 1.0950, close: 1.0980 },
  { time: '2024-10-29', open: 1.0980, high: 1.1000, low: 1.0960, close: 1.0990 },
  { time: '2024-10-30', open: 1.0990, high: 1.1010, low: 1.0970, close: 1.1000 },
  { time: '2024-10-31', open: 1.1000, high: 1.1020, low: 1.0980, close: 1.1010 },
  { time: '2024-11-01', open: 1.1010, high: 1.0990, low: 1.0960, close: 1.0970 },
  { time: '2024-11-04', open: 1.0970, high: 1.0950, low: 1.0920, close: 1.0930 },
  { time: '2024-11-05', open: 1.0930, high: 1.0960, low: 1.0910, close: 1.0950 },
  { time: '2024-11-06', open: 1.0950, high: 1.0980, low: 1.0930, close: 1.0970 },
  { time: '2024-11-07', open: 1.0970, high: 1.1000, low: 1.0950, close: 1.0990 },
  { time: '2024-11-08', open: 1.0990, high: 1.1010, low: 1.0970, close: 1.1000 },
  { time: '2024-11-11', open: 1.1000, high: 1.1020, low: 1.0980, close: 1.1010 },
  { time: '2024-11-12', open: 1.1010, high: 1.1030, low: 1.0990, close: 1.1020 },
  { time: '2024-11-13', open: 1.1020, high: 1.1040, low: 1.1000, close: 1.1030 },
  { time: '2024-11-14', open: 1.1030, high: 1.1050, low: 1.1010, close: 1.1040 },
  { time: '2024-11-15', open: 1.1040, high: 1.1060, low: 1.1020, close: 1.1050 },
  { time: '2024-11-18', open: 1.1050, high: 1.1070, low: 1.1030, close: 1.1060 },
  { time: '2024-11-19', open: 1.1060, high: 1.1080, low: 1.1040, close: 1.1070 },
  { time: '2024-11-20', open: 1.1070, high: 1.1050, low: 1.1020, close: 1.1030 },
  { time: '2024-11-21', open: 1.1030, high: 1.1060, low: 1.1010, close: 1.1050 },
  { time: '2024-11-22', open: 1.1050, high: 1.1070, low: 1.1030, close: 1.1060 },
  { time: '2024-11-25', open: 1.1060, high: 1.1080, low: 1.1040, close: 1.1070 },
  { time: '2024-11-26', open: 1.1070, high: 1.1090, low: 1.1050, close: 1.1080 },
  { time: '2024-11-27', open: 1.1080, high: 1.1100, low: 1.1060, close: 1.1090 },
  { time: '2024-11-28', open: 1.1090, high: 1.1110, low: 1.1070, close: 1.1100 },
  { time: '2024-11-29', open: 1.1100, high: 1.1080, low: 1.1050, close: 1.1060 },
  { time: '2024-12-02', open: 1.1060, high: 1.1040, low: 1.1010, close: 1.1020 },
  { time: '2024-12-03', open: 1.1020, high: 1.1000, low: 1.0970, close: 1.0980 },
  { time: '2024-12-04', open: 1.0980, high: 1.1010, low: 1.0960, close: 1.1000 },
  { time: '2024-12-05', open: 1.1000, high: 1.1030, low: 1.0980, close: 1.1020 },
  { time: '2024-12-06', open: 1.1020, high: 1.1050, low: 1.1000, close: 1.1040 },
  { time: '2024-12-09', open: 1.1040, high: 1.1070, low: 1.1020, close: 1.1060 },
  { time: '2024-12-10', open: 1.1060, high: 1.1090, low: 1.1040, close: 1.1080 },
  { time: '2024-12-11', open: 1.1080, high: 1.1100, low: 1.1060, close: 1.1090 },
  { time: '2024-12-12', open: 1.1090, high: 1.1110, low: 1.1070, close: 1.1100 },
  { time: '2024-12-13', open: 1.1100, high: 1.1120, low: 1.1080, close: 1.1110 },
  { time: '2024-12-16', open: 1.1110, high: 1.1130, low: 1.1090, close: 1.1120 },
  { time: '2024-12-17', open: 1.1120, high: 1.1140, low: 1.1100, close: 1.1130 },
  { time: '2024-12-18', open: 1.1130, high: 1.1150, low: 1.1110, close: 1.1140 },
  { time: '2024-12-19', open: 1.1140, high: 1.1160, low: 1.1120, close: 1.1150 },
  { time: '2024-12-20', open: 1.1150, high: 1.1130, low: 1.1100, close: 1.1110 },
  { time: '2024-12-23', open: 1.1110, high: 1.1090, low: 1.1060, close: 1.1070 },
  { time: '2024-12-24', open: 1.1070, high: 1.1050, low: 1.1020, close: 1.1030 },
  { time: '2024-12-25', open: 1.1030, high: 1.1060, low: 1.1010, close: 1.1050 },
  { time: '2024-12-26', open: 1.1050, high: 1.1080, low: 1.1030, close: 1.1070 },
  { time: '2024-12-27', open: 1.1070, high: 1.1100, low: 1.1050, close: 1.1090 },
  { time: '2024-12-30', open: 1.1090, high: 1.1110, low: 1.1070, close: 1.1100 },
  { time: '2025-01-02', open: 1.1100, high: 1.1120, low: 1.1080, close: 1.1110 },
  { time: '2025-01-03', open: 1.1110, high: 1.1130, low: 1.1090, close: 1.1120 },
  { time: '2025-01-06', open: 1.1120, high: 1.1140, low: 1.1100, close: 1.1130 },
  { time: '2025-01-07', open: 1.1130, high: 1.1150, low: 1.1110, close: 1.1140 },
  { time: '2025-01-08', open: 1.1140, high: 1.1120, low: 1.1090, close: 1.1100 },
  { time: '2025-01-09', open: 1.1100, high: 1.1130, low: 1.1080, close: 1.1120 },
  { time: '2025-01-10', open: 1.1120, high: 1.1150, low: 1.1100, close: 1.1140 },
  { time: '2025-01-13', open: 1.1140, high: 1.1160, low: 1.1120, close: 1.1150 },
  { time: '2025-01-14', open: 1.1150, high: 1.1170, low: 1.1130, close: 1.1160 },
  { time: '2025-01-15', open: 1.1160, high: 1.1180, low: 1.1140, close: 1.1170 },
  { time: '2025-01-16', open: 1.1170, high: 1.1190, low: 1.1150, close: 1.1180 },
  { time: '2025-01-17', open: 1.1180, high: 1.1160, low: 1.1130, close: 1.1140 },
  { time: '2025-01-20', open: 1.1140, high: 1.1120, low: 1.1090, close: 1.1100 },
  { time: '2025-01-21', open: 1.1100, high: 1.1130, low: 1.1080, close: 1.1120 },
  { time: '2025-01-22', open: 1.1120, high: 1.1150, low: 1.1100, close: 1.1140 },
  { time: '2025-01-23', open: 1.1140, high: 1.1170, low: 1.1120, close: 1.1160 },
  { time: '2025-01-24', open: 1.1160, high: 1.1180, low: 1.1140, close: 1.1170 },
  { time: '2025-01-27', open: 1.1170, high: 1.1150, low: 1.1120, close: 1.1130 },
  { time: '2025-01-28', open: 1.1130, high: 1.1160, low: 1.1110, close: 1.1150 },
  { time: '2025-01-29', open: 1.1150, high: 1.1180, low: 1.1130, close: 1.1170 },
  { time: '2025-01-30', open: 1.1170, high: 1.1200, low: 1.1150, close: 1.1190 },
  { time: '2025-01-31', open: 1.1190, high: 1.1210, low: 1.1170, close: 1.1200 },
  { time: '2025-02-03', open: 1.1200, high: 1.1220, low: 1.1180, close: 1.1210 },
  { time: '2025-02-04', open: 1.1210, high: 1.1190, low: 1.1160, close: 1.1170 },
  { time: '2025-02-05', open: 1.1170, high: 1.1150, low: 1.1120, close: 1.1130 },
  { time: '2025-02-06', open: 1.1130, high: 1.1160, low: 1.1110, close: 1.1150 },
  { time: '2025-02-07', open: 1.1150, high: 1.1180, low: 1.1130, close: 1.1170 },
  { time: '2025-02-10', open: 1.1170, high: 1.1190, low: 1.1150, close: 1.1180 },
  { time: '2025-02-11', open: 1.1180, high: 1.1200, low: 1.1160, close: 1.1190 },
  { time: '2025-02-12', open: 1.1190, high: 1.1210, low: 1.1170, close: 1.1200 },
  { time: '2025-02-13', open: 1.1200, high: 1.1220, low: 1.1180, close: 1.1210 },
  { time: '2025-02-14', open: 1.1210, high: 1.1190, low: 1.1160, close: 1.1170 },
  { time: '2025-02-17', open: 1.1170, high: 1.1150, low: 1.1120, close: 1.1130 },
  { time: '2025-02-18', open: 1.1130, high: 1.1160, low: 1.1110, close: 1.1150 },
  { time: '2025-02-19', open: 1.1150, high: 1.1180, low: 1.1130, close: 1.1170 },
  { time: '2025-02-20', open: 1.1170, high: 1.1200, low: 1.1150, close: 1.1190 },
  { time: '2025-02-21', open: 1.1190, high: 1.1210, low: 1.1170, close: 1.1200 },
  { time: '2025-02-24', open: 1.1200, high: 1.1220, low: 1.1180, close: 1.1210 },
  { time: '2025-02-25', open: 1.1210, high: 1.1230, low: 1.1190, close: 1.1220 },
  { time: '2025-02-26', open: 1.1220, high: 1.1240, low: 1.1200, close: 1.1230 },
  { time: '2025-02-27', open: 1.1230, high: 1.1250, low: 1.1210, close: 1.1240 },
  { time: '2025-02-28', open: 1.1240, high: 1.1220, low: 1.1190, close: 1.1200 },
  { time: '2025-03-03', open: 1.1200, high: 1.1220, low: 1.1180, close: 1.1210 },
  { time: '2025-03-04', open: 1.1210, high: 1.1240, low: 1.1190, close: 1.1230 },
  { time: '2025-03-05', open: 1.1230, high: 1.1260, low: 1.1210, close: 1.1250 },
  { time: '2025-03-06', open: 1.1250, high: 1.1280, low: 1.1230, close: 1.1270 },
  { time: '2025-03-07', open: 1.1270, high: 1.1290, low: 1.1250, close: 1.1280 },
  { time: '2025-03-10', open: 1.1280, high: 1.1300, low: 1.1260, close: 1.1290 },
  { time: '2025-03-11', open: 1.1290, high: 1.1310, low: 1.1270, close: 1.1300 },
  { time: '2025-03-12', open: 1.1300, high: 1.1280, low: 1.1250, close: 1.1260 },
  { time: '2025-03-13', open: 1.1260, high: 1.1240, low: 1.1210, close: 1.1220 },
  { time: '2025-03-14', open: 1.1220, high: 1.1250, low: 1.1200, close: 1.1240 },
  { time: '2025-03-17', open: 1.1240, high: 1.1270, low: 1.1220, close: 1.1260 },
  { time: '2025-03-18', open: 1.1260, high: 1.1290, low: 1.1240, close: 1.1280 },
  { time: '2025-03-19', open: 1.1280, high: 1.1300, low: 1.1260, close: 1.1290 },
  { time: '2025-03-20', open: 1.1290, high: 1.1270, low: 1.1240, close: 1.1250 },
  { time: '2025-03-21', open: 1.1250, high: 1.1230, low: 1.1200, close: 1.1210 },
  { time: '2025-03-24', open: 1.1210, high: 1.1240, low: 1.1190, close: 1.1230 },
  { time: '2025-03-25', open: 1.1230, high: 1.1260, low: 1.1210, close: 1.1250 },
  { time: '2025-03-26', open: 1.1250, high: 1.1280, low: 1.1230, close: 1.1270 },
  { time: '2025-03-27', open: 1.1270, high: 1.1290, low: 1.1250, close: 1.1280 },
  { time: '2025-03-28', open: 1.1280, high: 1.1260, low: 1.1230, close: 1.1240 },
  { time: '2025-03-31', open: 1.1240, high: 1.1220, low: 1.1190, close: 1.1200 },
  { time: '2025-04-01', open: 1.1200, high: 1.1230, low: 1.1180, close: 1.1220 },
  { time: '2025-04-02', open: 1.1220, high: 1.1250, low: 1.1200, close: 1.1240 },
  { time: '2025-04-03', open: 1.1240, high: 1.1270, low: 1.1220, close: 1.1260 },
  { time: '2025-04-06', open: 1.1260, high: 1.1290, low: 1.1240, close: 1.1280 },
  { time: '2025-04-07', open: 1.1280, high: 1.1300, low: 1.1260, close: 1.1290 },
  { time: '2025-04-08', open: 1.1290, high: 1.1310, low: 1.1270, close: 1.1300 },
  { time: '2025-04-09', open: 1.1300, high: 1.1320, low: 1.1280, close: 1.1310 },
  { time: '2025-04-10', open: 1.1310, high: 1.1330, low: 1.1290, close: 1.1320 },
  { time: '2025-04-13', open: 1.1320, high: 1.1340, low: 1.1300, close: 1.1330 },
  { time: '2025-04-14', open: 1.1330, high: 1.1350, low: 1.1310, close: 1.1340 },
  { time: '2025-04-15', open: 1.1340, high: 1.1360, low: 1.1320, close: 1.1350 },
  { time: '2025-04-16', open: 1.1350, high: 1.1330, low: 1.1300, close: 1.1310 },
  { time: '2025-04-17', open: 1.1310, high: 1.1290, low: 1.1260, close: 1.1270 },
  { time: '2025-04-20', open: 1.1270, high: 1.1250, low: 1.1220, close: 1.1230 },
  { time: '2025-04-21', open: 1.1230, high: 1.1210, low: 1.1180, close: 1.1190 },
  { time: '2025-04-22', open: 1.1190, high: 1.1220, low: 1.1170, close: 1.1210 },
  { time: '2025-04-23', open: 1.1210, high: 1.1240, low: 1.1190, close: 1.1230 },
  { time: '2025-04-24', open: 1.1230, high: 1.1250, low: 1.1210, close: 1.1220 },
  { time: '2025-04-27', open: 1.1220, high: 1.1200, low: 1.1170, close: 1.1180 },
  { time: '2025-04-28', open: 1.1180, high: 1.1160, low: 1.1130, close: 1.1140 },
  { time: '2025-04-29', open: 1.1140, high: 1.1120, low: 1.1090, close: 1.1100 },
  { time: '2025-04-30', open: 1.1100, high: 1.1130, low: 1.1080, close: 1.1120 },
  { time: '2025-05-01', open: 1.1120, high: 1.1150, low: 1.1100, close: 1.1140 },
  { time: '2025-05-04', open: 1.1140, high: 1.1170, low: 1.1120, close: 1.1160 },
  { time: '2025-05-05', open: 1.1160, high: 1.1190, low: 1.1140, close: 1.1170 },
  { time: '2025-05-06', open: 1.1170, high: 1.1200, low: 1.1150, close: 1.1190 },
  { time: '2025-05-07', open: 1.1190, high: 1.1220, low: 1.1170, close: 1.1210 },
  { time: '2025-05-08', open: 1.1210, high: 1.1240, low: 1.1190, close: 1.1220 },
  { time: '2025-05-11', open: 1.1220, high: 1.1250, low: 1.1200, close: 1.1230 },
  { time: '2025-05-12', open: 1.1230, high: 1.1260, low: 1.1210, close: 1.1250 },
  { time: '2025-05-13', open: 1.1250, high: 1.1280, low: 1.1230, close: 1.1270 },
  { time: '2025-05-14', open: 1.1270, high: 1.1300, low: 1.1250, close: 1.1290 },
  { time: '2025-05-15', open: 1.1290, high: 1.1320, low: 1.1270, close: 1.1310 },
  { time: '2025-05-18', open: 1.1310, high: 1.1340, low: 1.1290, close: 1.1330 },
  { time: '2025-05-19', open: 1.1330, high: 1.1360, low: 1.1310, close: 1.1350 },
  { time: '2025-05-20', open: 1.1350, high: 1.1380, low: 1.1330, close: 1.1370 },
  { time: '2025-05-21', open: 1.1370, high: 1.1400, low: 1.1350, close: 1.1390 },
  { time: '2025-05-22', open: 1.1390, high: 1.1420, low: 1.1370, close: 1.1410 },
  { time: '2025-05-25', open: 1.1410, high: 1.1440, low: 1.1390, close: 1.1430 },
  { time: '2025-05-26', open: 1.1430, high: 1.1460, low: 1.1410, close: 1.1450 },
  { time: '2025-05-27', open: 1.1450, high: 1.1480, low: 1.1430, close: 1.1470 },
  { time: '2025-05-28', open: 1.1470, high: 1.1500, low: 1.1450, close: 1.1490 },
  { time: '2025-05-29', open: 1.1490, high: 1.1520, low: 1.1470, close: 1.1510 },
  { time: '2025-06-01', open: 1.1510, high: 1.1540, low: 1.1490, close: 1.1530 },
  { time: '2025-06-02', open: 1.1530, high: 1.1560, low: 1.1510, close: 1.1550 },
  { time: '2025-06-03', open: 1.1550, high: 1.1580, low: 1.1530, close: 1.1570 },
  { time: '2025-06-04', open: 1.1570, high: 1.1600, low: 1.1550, close: 1.1590 },
  { time: '2025-06-05', open: 1.1590, high: 1.1620, low: 1.1570, close: 1.1610 },
  { time: '2025-06-08', open: 1.1610, high: 1.1640, low: 1.1590, close: 1.1630 },
  { time: '2025-06-09', open: 1.1630, high: 1.1660, low: 1.1610, close: 1.1650 },
  { time: '2025-06-10', open: 1.1650, high: 1.1680, low: 1.1630, close: 1.1670 },
  { time: '2025-06-11', open: 1.1670, high: 1.1700, low: 1.1650, close: 1.1690 },
  { time: '2025-06-12', open: 1.1690, high: 1.1720, low: 1.1670, close: 1.1710 },
  { time: '2025-06-15', open: 1.1710, high: 1.1740, low: 1.1690, close: 1.1730 },
  { time: '2025-06-16', open: 1.1730, high: 1.1760, low: 1.1710, close: 1.1750 },
  { time: '2025-06-17', open: 1.1750, high: 1.1730, low: 1.1700, close: 1.1710 },
  { time: '2025-06-18', open: 1.1710, high: 1.1690, low: 1.1660, close: 1.1670 },
  { time: '2025-06-19', open: 1.1670, high: 1.1650, low: 1.1620, close: 1.1630 },
  { time: '2025-06-22', open: 1.1630, high: 1.1660, low: 1.1610, close: 1.1650 },
  { time: '2025-06-23', open: 1.1650, high: 1.1680, low: 1.1630, close: 1.1670 },
  { time: '2025-06-24', open: 1.1670, high: 1.1700, low: 1.1650, close: 1.1690 },
  { time: '2025-06-25', open: 1.1690, high: 1.1710, low: 1.1670, close: 1.1680 },
  { time: '2025-06-26', open: 1.1680, high: 1.1700, low: 1.1660, close: 1.1670 },
  { time: '2025-06-29', open: 1.1670, high: 1.1650, low: 1.1620, close: 1.1630 },
  { time: '2025-06-30', open: 1.1630, high: 1.1610, low: 1.1580, close: 1.1590 },
  { time: '2025-07-01', open: 1.1590, high: 1.1620, low: 1.1570, close: 1.1610 },
  { time: '2025-07-02', open: 1.1610, high: 1.1640, low: 1.1590, close: 1.1630 },
  { time: '2025-07-03', open: 1.1630, high: 1.1660, low: 1.1610, close: 1.1650 },
  { time: '2025-07-06', open: 1.1650, high: 1.1680, low: 1.1630, close: 1.1670 },
  { time: '2025-07-07', open: 1.1670, high: 1.1700, low: 1.1650, close: 1.1690 },
  { time: '2025-07-08', open: 1.1690, high: 1.1710, low: 1.1670, close: 1.1680 },
  { time: '2025-07-09', open: 1.1680, high: 1.1660, low: 1.1630, close: 1.1640 },
  { time: '2025-07-10', open: 1.1640, high: 1.1670, low: 1.1620, close: 1.1660 },
  { time: '2025-07-13', open: 1.1660, high: 1.1690, low: 1.1640, close: 1.1680 },
  { time: '2025-07-14', open: 1.1680, high: 1.1710, low: 1.1660, close: 1.1700 },
  { time: '2025-07-15', open: 1.1700, high: 1.1730, low: 1.1680, close: 1.1720 },
  { time: '2025-07-16', open: 1.1720, high: 1.1750, low: 1.1700, close: 1.1740 },
  { time: '2025-07-17', open: 1.1740, high: 1.1770, low: 1.1720, close: 1.1760 },
  { time: '2025-07-20', open: 1.1760, high: 1.1790, low: 1.1740, close: 1.1780 },
  { time: '2025-07-21', open: 1.1780, high: 1.1810, low: 1.1760, close: 1.1800 },
  { time: '2025-07-22', open: 1.1800, high: 1.1830, low: 1.1780, close: 1.1820 },
  { time: '2025-07-23', open: 1.1820, high: 1.1850, low: 1.1800, close: 1.1840 },
  { time: '2025-07-24', open: 1.1840, high: 1.1870, low: 1.1820, close: 1.1860 },
  { time: '2025-07-27', open: 1.1860, high: 1.1840, low: 1.1810, close: 1.1830 },
  { time: '2025-07-28', open: 1.1830, high: 1.1810, low: 1.1780, close: 1.1800 },
  { time: '2025-07-29', open: 1.1800, high: 1.1830, low: 1.1780, close: 1.1820 },
  { time: '2025-07-30', open: 1.1820, high: 1.1850, low: 1.1800, close: 1.1840 },
  { time: '2025-07-31', open: 1.1840, high: 1.1870, low: 1.1820, close: 1.1860 },
  { time: '2025-08-03', open: 1.1860, high: 1.1890, low: 1.1840, close: 1.1880 },
  { time: '2025-08-04', open: 1.1880, high: 1.1910, low: 1.1860, close: 1.1900 },
  { time: '2025-08-05', open: 1.1900, high: 1.1930, low: 1.1880, close: 1.1920 },
  { time: '2025-08-06', open: 1.1920, high: 1.1950, low: 1.1900, close: 1.1940 },
  { time: '2025-08-07', open: 1.1940, high: 1.1970, low: 1.1920, close: 1.1960 },
  { time: '2025-08-10', open: 1.1960, high: 1.1990, low: 1.1940, close: 1.1980 },
  { time: '2025-08-11', open: 1.1980, high: 1.1960, low: 1.1930, close: 1.1940 },
  { time: '2025-08-12', open: 1.1940, high: 1.1970, low: 1.1920, close: 1.1960 },
  { time: '2025-08-13', open: 1.1960, high: 1.1990, low: 1.1940, close: 1.1980 },
  { time: '2025-08-14', open: 1.1980, high: 1.2010, low: 1.1960, close: 1.2000 },
  { time: '2025-08-17', open: 1.2000, high: 1.2030, low: 1.1980, close: 1.2020 },
  { time: '2025-08-18', open: 1.2020, high: 1.2050, low: 1.2000, close: 1.2040 },
  { time: '2025-08-19', open: 1.2040, high: 1.2070, low: 1.2020, close: 1.2060 },
  { time: '2025-08-20', open: 1.2060, high: 1.2090, low: 1.2040, close: 1.2080 },
  { time: '2025-08-21', open: 1.2080, high: 1.2100, low: 1.2060, close: 1.2070 },
  { time: '2025-08-24', open: 1.2070, high: 1.2050, low: 1.2020, close: 1.2030 },
  { time: '2025-08-25', open: 1.2030, high: 1.2060, low: 1.2010, close: 1.2050 },
  { time: '2025-08-26', open: 1.2050, high: 1.2080, low: 1.2030, close: 1.2070 },
  { time: '2025-08-27', open: 1.2070, high: 1.2100, low: 1.2050, close: 1.2090 },
  { time: '2025-08-28', open: 1.2090, high: 1.2110, low: 1.2070, close: 1.2100 },
  { time: '2025-08-31', open: 1.2100, high: 1.2120, low: 1.2080, close: 1.2110 },
  { time: '2025-09-01', open: 1.2110, high: 1.2130, low: 1.2090, close: 1.2120 },
  { time: '2025-09-02', open: 1.2120, high: 1.2150, low: 1.2100, close: 1.2140 },
  { time: '2025-09-03', open: 1.2140, high: 1.2170, low: 1.2120, close: 1.2160 },
  { time: '2025-09-04', open: 1.2160, high: 1.2190, low: 1.2140, close: 1.2180 },
  { time: '2025-09-08', open: 1.2180, high: 1.2210, low: 1.2160, close: 1.2200 },
  { time: '2025-09-09', open: 1.2200, high: 1.2230, low: 1.2180, close: 1.2220 },
  { time: '2025-09-10', open: 1.2220, high: 1.2250, low: 1.2200, close: 1.2240 },
  { time: '2025-09-11', open: 1.2240, high: 1.2270, low: 1.2220, close: 1.2260 },
  { time: '2025-09-14', open: 1.2260, high: 1.2290, low: 1.2240, close: 1.2280 },
  { time: '2025-09-15', open: 1.2280, high: 1.2310, low: 1.2260, close: 1.2300 },
  { time: '2025-09-16', open: 1.2300, high: 1.2330, low: 1.2280, close: 1.2320 },
  { time: '2025-09-17', open: 1.2320, high: 1.2350, low: 1.2300, close: 1.2340 },
  { time: '2025-09-18', open: 1.2340, high: 1.2370, low: 1.2320, close: 1.2360 },
  { time: '2025-09-21', open: 1.2360, high: 1.2340, low: 1.2310, close: 1.2330 },
  { time: '2025-09-22', open: 1.2330, high: 1.2310, low: 1.2280, close: 1.2300 },
  { time: '2025-09-23', open: 1.2300, high: 1.2330, low: 1.2280, close: 1.2320 },
  { time: '2025-09-24', open: 1.2320, high: 1.2350, low: 1.2300, close: 1.2340 },
  { time: '2025-09-25', open: 1.2340, high: 1.2370, low: 1.2320, close: 1.2360 },
  { time: '2025-09-28', open: 1.2360, high: 1.2340, low: 1.2310, close: 1.2330 },
  { time: '2025-09-29', open: 1.2330, high: 1.2310, low: 1.2280, close: 1.2300 },
  { time: '2025-09-30', open: 1.2300, high: 1.2330, low: 1.2280, close: 1.2320 },
  { time: '2025-10-01', open: 1.2320, high: 1.2350, low: 1.2300, close: 1.2340 },
  { time: '2025-10-02', open: 1.2340, high: 1.2370, low: 1.2320, close: 1.2360 },
  { time: '2025-10-05', open: 1.2360, high: 1.2390, low: 1.2340, close: 1.2380 },
  { time: '2025-10-06', open: 1.2380, high: 1.2410, low: 1.2360, close: 1.2400 },
  { time: '2025-10-07', open: 1.2400, high: 1.2430, low: 1.2380, close: 1.2420 },
  { time: '2025-10-08', open: 1.2420, high: 1.2450, low: 1.2400, close: 1.2440 },
  { time: '2025-10-09', open: 1.2440, high: 1.2470, low: 1.2420, close: 1.2460 },
  { time: '2025-10-12', open: 1.2460, high: 1.2490, low: 1.2440, close: 1.2480 },
  { time: '2025-10-13', open: 1.2480, high: 1.2510, low: 1.2460, close: 1.2500 },
  { time: '2025-10-14', open: 1.2500, high: 1.2530, low: 1.2480, close: 1.2520 },
  { time: '2025-10-15', open: 1.2520, high: 1.2550, low: 1.2500, close: 1.2540 },
  { time: '2025-10-16', open: 1.2540, high: 1.2520, low: 1.2470, close: 1.2490 },
  { time: '2025-10-19', open: 1.2490, high: 1.2470, low: 1.2420, close: 1.2440 },
  { time: '2025-10-20', open: 1.2440, high: 1.2470, low: 1.2420, close: 1.2460 },
  { time: '2025-10-21', open: 1.2460, high: 1.2490, low: 1.2440, close: 1.2480 },
  { time: '2025-10-22', open: 1.2480, high: 1.2510, low: 1.2460, close: 1.2500 },
  { time: '2025-10-23', open: 1.2500, high: 1.2530, low: 1.2480, close: 1.2520 },
  { time: '2025-10-26', open: 1.2520, high: 1.2550, low: 1.2500, close: 1.2540 },
  { time: '2025-10-27', open: 1.2540, high: 1.2570, low: 1.2520, close: 1.2560 },
  { time: '2025-10-28', open: 1.2560, high: 1.2590, low: 1.2540, close: 1.2580 },
  { time: '2025-10-29', open: 1.2580, high: 1.2610, low: 1.2560, close: 1.2600 },
  { time: '2025-10-30', open: 1.2600, high: 1.2630, low: 1.2580, close: 1.2620 },
  { time: '2025-11-02', open: 1.2620, high: 1.2650, low: 1.2600, close: 1.2640 },
  { time: '2025-11-03', open: 1.2640, high: 1.2670, low: 1.2620, close: 1.2660 },
  { time: '2025-11-04', open: 1.2660, high: 1.2690, low: 1.2640, close: 1.2680 },
  { time: '2025-11-05', open: 1.2680, high: 1.2710, low: 1.2660, close: 1.2700 },
  { time: '2025-11-06', open: 1.2700, high: 1.2730, low: 1.2680, close: 1.2720 },
  { time: '2025-11-09', open: 1.2720, high: 1.2750, low: 1.2700, close: 1.2740 },
  { time: '2025-11-10', open: 1.2740, high: 1.2770, low: 1.2720, close: 1.2760 },
  { time: '2025-11-11', open: 1.2760, high: 1.2790, low: 1.2740, close: 1.2780 },
  { time: '2025-11-12', open: 1.2780, high: 1.2810, low: 1.2760, close: 1.2800 },
  { time: '2025-11-13', open: 1.2800, high: 1.2830, low: 1.2780, close: 1.2820 },
  { time: '2025-11-16', open: 1.2820, high: 1.2800, low: 1.2750, close: 1.2770 },
  { time: '2025-11-17', open: 1.2770, high: 1.2740, low: 1.2690, close: 1.2710 },
  { time: '2025-11-18', open: 1.2710, high: 1.2740, low: 1.2690, close: 1.2730 },
  { time: '2025-11-19', open: 1.2730, high: 1.2760, low: 1.2710, close: 1.2750 },
  { time: '2025-11-20', open: 1.2750, high: 1.2780, low: 1.2730, close: 1.2770 },
  { time: '2025-11-23', open: 1.2770, high: 1.2790, low: 1.2740, close: 1.2760 },
  { time: '2025-11-24', open: 1.2760, high: 1.2780, low: 1.2730, close: 1.2750 },
  { time: '2025-11-25', open: 1.2750, high: 1.2770, low: 1.2720, close: 1.2740 },
  { time: '2025-11-26', open: 1.2740, high: 1.2760, low: 1.2710, close: 1.2730 },
  { time: '2025-11-27', open: 1.2730, high: 1.2750, low: 1.2700, close: 1.2720 },
  { time: '2025-11-30', open: 1.2720, high: 1.2700, low: 1.2650, close: 1.2670 },
  { time: '2025-12-01', open: 1.2670, high: 1.2700, low: 1.2650, close: 1.2680 },
  { time: '2025-12-02', open: 1.2680, high: 1.2710, low: 1.2660, close: 1.2690 },
  { time: '2025-12-03', open: 1.2690, high: 1.2720, low: 1.2670, close: 1.2700 },
  { time: '2025-12-04', open: 1.2700, high: 1.2730, low: 1.2680, close: 1.2710 },
  { time: '2025-12-07', open: 1.2710, high: 1.2740, low: 1.2690, close: 1.2720 },
  { time: '2025-12-08', open: 1.2720, high: 1.2750, low: 1.2700, close: 1.2730 },
  { time: '2025-12-09', open: 1.2730, high: 1.2760, low: 1.2710, close: 1.2740 },
  { time: '2025-12-10', open: 1.2740, high: 1.2770, low: 1.2720, close: 1.2750 },
  { time: '2025-12-11', open: 1.2750, high: 1.2780, low: 1.2730, close: 1.2770 },
  { time: '2025-12-14', open: 1.2770, high: 1.2800, low: 1.2750, close: 1.2790 },
  { time: '2025-12-15', open: 1.2790, high: 1.2820, low: 1.2770, close: 1.2810 },
  { time: '2025-12-16', open: 1.2810, high: 1.2840, low: 1.2790, close: 1.2830 },
  { time: '2025-12-17', open: 1.2830, high: 1.2860, low: 1.2810, close: 1.2850 },
  { time: '2025-12-18', open: 1.2850, high: 1.2830, low: 1.2780, close: 1.2800 },
  { time: '2025-12-21', open: 1.2800, high: 1.2780, low: 1.2730, close: 1.2750 },
  { time: '2025-12-22', open: 1.2750, high: 1.2780, low: 1.2730, close: 1.2770 },
  { time: '2025-12-23', open: 1.2770, high: 1.2800, low: 1.2750, close: 1.2790 },
  { time: '2025-12-24', open: 1.2790, high: 1.2820, low: 1.2770, close: 1.2810 },
  { time: '2025-12-25', open: 1.2810, high: 1.2840, low: 1.2790, close: 1.2830 },
  { time: '2025-12-28', open: 1.2830, high: 1.2800, low: 1.2750, close: 1.2770 },
  { time: '2025-12-29', open: 1.2770, high: 1.2790, low: 1.2740, close: 1.2760 },
  { time: '2025-12-30', open: 1.2760, high: 1.2780, low: 1.2730, close: 1.2750 },
  { time: '2026-01-01', open: 1.2750, high: 1.2780, low: 1.2730, close: 1.2770 },
  { time: '2026-01-04', open: 1.2770, high: 1.2800, low: 1.2750, close: 1.2790 },
  { time: '2026-01-05', open: 1.2790, high: 1.2820, low: 1.2770, close: 1.2810 },
  { time: '2026-01-06', open: 1.2810, high: 1.2840, low: 1.2790, close: 1.2830 },
  { time: '2026-01-07', open: 1.2830, high: 1.2860, low: 1.2810, close: 1.2850 },
  { time: '2026-01-08', open: 1.2850, high: 1.2880, low: 1.2830, close: 1.2870 },
  { time: '2026-01-11', open: 1.2870, high: 1.2900, low: 1.2850, close: 1.2890 },
  { time: '2026-01-12', open: 1.2890, high: 1.2920, low: 1.2870, close: 1.2910 },
  { time: '2026-01-13', open: 1.2910, high: 1.2940, low: 1.2890, close: 1.2930 },
  { time: '2026-01-14', open: 1.2930, high: 1.2960, low: 1.2910, close: 1.2950 },
  { time: '2026-01-15', open: 1.2950, high: 1.2980, low: 1.2930, close: 1.2970 },
  { time: '2026-01-18', open: 1.2970, high: 1.2950, low: 1.2900, close: 1.2920 },
  { time: '2026-01-19', open: 1.2920, high: 1.2900, low: 1.2850, close: 1.2870 },
  { time: '2026-01-20', open: 1.2870, high: 1.2900, low: 1.2850, close: 1.2890 },
  { time: '2026-01-21', open: 1.2890, high: 1.2920, low: 1.2870, close: 1.2910 },
  { time: '2026-01-22', open: 1.2910, high: 1.2940, low: 1.2890, close: 1.2930 },
  { time: '2026-01-25', open: 1.2930, high: 1.2960, low: 1.2910, close: 1.2950 },
  { time: '2026-01-26', open: 1.2950, high: 1.2980, low: 1.2930, close: 1.2970 },
  { time: '2026-01-27', open: 1.2970, high: 1.3000, low: 1.2950, close: 1.2990 },
  { time: '2026-01-28', open: 1.2990, high: 1.3020, low: 1.2970, close: 1.3010 },
  { time: '2026-01-29', open: 1.3010, high: 1.3040, low: 1.2990, close: 1.3030 },
  { time: '2026-02-01', open: 1.3030, high: 1.3060, low: 1.3010, close: 1.3050 },
  { time: '2026-02-02', open: 1.3050, high: 1.3080, low: 1.3030, close: 1.3070 },
  { time: '2026-02-03', open: 1.3070, high: 1.3100, low: 1.3050, close: 1.3090 },
  { time: '2026-02-04', open: 1.3090, high: 1.3120, low: 1.3070, close: 1.3110 },
  { time: '2026-02-05', open: 1.3110, high: 1.3140, low: 1.3090, close: 1.3130 },
  { time: '2026-02-08', open: 1.3130, high: 1.3160, low: 1.3110, close: 1.3150 },
  { time: '2026-02-09', open: 1.3150, high: 1.3180, low: 1.3130, close: 1.3170 },
  { time: '2026-02-10', open: 1.3170, high: 1.3200, low: 1.3150, close: 1.3190 },
  { time: '2026-02-11', open: 1.3190, high: 1.3220, low: 1.3170, close: 1.3210 },
  { time: '2026-02-12', open: 1.3210, high: 1.3240, low: 1.3190, close: 1.3230 },
  { time: '2026-02-15', open: 1.3230, high: 1.3260, low: 1.3210, close: 1.3250 },
  { time: '2026-02-16', open: 1.3250, high: 1.3280, low: 1.3230, close: 1.3270 },
  { time: '2026-02-17', open: 1.3270, high: 1.3300, low: 1.3250, close: 1.3290 },
  { time: '2026-02-18', open: 1.3290, high: 1.3320, low: 1.3270, close: 1.3310 },
  { time: '2026-02-19', open: 1.3310, high: 1.3340, low: 1.3290, close: 1.3330 },
  { time: '2026-02-22', open: 1.3330, high: 1.3310, low: 1.3260, close: 1.3280 },
  { time: '2026-02-23', open: 1.3280, high: 1.3260, low: 1.3210, close: 1.3230 },
  { time: '2026-02-24', open: 1.3230, high: 1.3260, low: 1.3210, close: 1.3250 },
  { time: '2026-02-25', open: 1.3250, high: 1.3280, low: 1.3230, close: 1.3270 },
  { time: '2026-02-26', open: 1.3270, high: 1.3300, low: 1.3250, close: 1.3290 },
  { time: '2026-03-01', open: 1.3290, high: 1.3320, low: 1.3270, close: 1.3310 },
  { time: '2026-03-02', open: 1.3310, high: 1.3340, low: 1.3290, close: 1.3330 },
  { time: '2026-03-03', open: 1.3330, high: 1.3360, low: 1.3310, close: 1.3350 },
  { time: '2026-03-04', open: 1.3350, high: 1.3380, low: 1.3330, close: 1.3370 },
  { time: '2026-03-05', open: 1.3370, high: 1.3400, low: 1.3350, close: 1.3390 },
  { time: '2026-03-08', open: 1.3390, high: 1.3420, low: 1.3370, close: 1.3410 },
  { time: '2026-03-09', open: 1.3410, high: 1.3440, low: 1.3390, close: 1.3430 },
  { time: '2026-03-10', open: 1.3430, high: 1.3460, low: 1.3410, close: 1.3450 },
  { time: '2026-03-11', open: 1.3450, high: 1.3480, low: 1.3430, close: 1.3470 },
  { time: '2026-03-12', open: 1.3470, high: 1.3500, low: 1.3450, close: 1.3490 },
  { time: '2026-03-15', open: 1.3490, high: 1.3520, low: 1.3470, close: 1.3510 },
  { time: '2026-03-16', open: 1.3510, high: 1.3540, low: 1.3490, close: 1.3530 },
  { time: '2026-03-17', open: 1.3530, high: 1.3560, low: 1.3510, close: 1.3550 },
  { time: '2026-03-18', open: 1.3550, high: 1.3580, low: 1.3530, close: 1.3570 },
  { time: '2026-03-19', open: 1.3570, high: 1.3600, low: 1.3550, close: 1.3590 },
  { time: '2026-03-22', open: 1.3590, high: 1.3570, low: 1.3520, close: 1.3540 },
  { time: '2026-03-23', open: 1.3540, high: 1.3520, low: 1.3470, close: 1.3490 },
  { time: '2026-03-24', open: 1.3490, high: 1.3520, low: 1.3470, close: 1.3510 },
  { time: '2026-03-25', open: 1.3510, high: 1.3540, low: 1.3490, close: 1.3530 },
  { time: '2026-03-26', open: 1.3530, high: 1.3560, low: 1.3510, close: 1.3550 },
  { time: '2026-03-29', open: 1.3550, high: 1.3530, low: 1.3480, close: 1.3500 },
  { time: '2026-03-30', open: 1.3500, high: 1.3480, low: 1.3430, close: 1.3450 },
  { time: '2026-03-31', open: 1.3450, high: 1.3480, low: 1.3430, close: 1.3470 },
  { time: '2026-04-01', open: 1.3470, high: 1.3500, low: 1.3450, close: 1.3490 },
  { time: '2026-04-05', open: 1.3490, high: 1.3520, low: 1.3470, close: 1.3510 },
  { time: '2026-04-06', open: 1.3510, high: 1.3540, low: 1.3490, close: 1.3530 },
  { time: '2026-04-07', open: 1.3530, high: 1.3560, low: 1.3510, close: 1.3550 },
  { time: '2026-04-08', open: 1.3550, high: 1.3580, low: 1.3530, close: 1.3570 },
  { time: '2026-04-09', open: 1.3570, high: 1.3600, low: 1.3550, close: 1.3590 },
  { time: '2026-04-12', open: 1.3590, high: 1.3620, low: 1.3570, close: 1.3610 },
  { time: '2026-04-13', open: 1.3610, high: 1.3640, low: 1.3590, close: 1.3630 },
  { time: '2026-04-14', open: 1.3630, high: 1.3660, low: 1.3610, close: 1.3650 },
  { time: '2026-04-15', open: 1.3650, high: 1.3680, low: 1.3630, close: 1.3670 },
  { time: '2026-04-16', open: 1.3670, high: 1.3650, low: 1.3600, close: 1.3620 },
  { time: '2026-04-19', open: 1.3620, high: 1.3600, low: 1.3550, close: 1.3570 },
  { time: '2026-04-20', open: 1.3570, high: 1.3550, low: 1.3500, close: 1.3520 },
  { time: '2026-04-21', open: 1.3520, high: 1.3550, low: 1.3500, close: 1.3540 },
];

function calculateEMA(data: Candle[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prevEma = data[0].close;
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(data[0].close);
    } else {
      prevEma = data[i].close * k + prevEma * (1 - k);
      ema.push(prevEma);
    }
  }
  return ema;
}

export function drawChart(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  // Clear
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  const visibleData = candleData.slice(-80);
  const ema20 = calculateEMA(candleData, 20).slice(-80);
  const ema50 = calculateEMA(candleData, 50).slice(-80);
  const ema200 = calculateEMA(candleData, 200).slice(-80);

  const allPrices = visibleData.flatMap(d => [d.high, d.low]);
  const minPrice = Math.min(...allPrices) * 0.999;
  const maxPrice = Math.max(...allPrices) * 1.001;
  const priceRange = maxPrice - minPrice;

  const chartTop = 20;
  const chartBottom = height - 30;
  const chartHeight = chartBottom - chartTop;
  const candleWidth = Math.max(2, (width - 80) / visibleData.length - 1);
  const candleSpacing = candleWidth + 1;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) {
    const y = chartTop + (chartHeight / 6) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width - 60, y);
    ctx.stroke();
  }

  // EMA 200
  ctx.strokeStyle = 'rgba(139,92,246,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < visibleData.length; i++) {
    const x = i * candleSpacing + candleWidth / 2;
    const y = chartTop + ((maxPrice - ema200[i]) / priceRange) * chartHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // EMA 50
  ctx.strokeStyle = 'rgba(59,130,246,0.6)';
  ctx.beginPath();
  for (let i = 0; i < visibleData.length; i++) {
    const x = i * candleSpacing + candleWidth / 2;
    const y = chartTop + ((maxPrice - ema50[i]) / priceRange) * chartHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // EMA 20
  ctx.strokeStyle = 'rgba(234,179,8,0.6)';
  ctx.beginPath();
  for (let i = 0; i < visibleData.length; i++) {
    const x = i * candleSpacing + candleWidth / 2;
    const y = chartTop + ((maxPrice - ema20[i]) / priceRange) * chartHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Candles
  for (let i = 0; i < visibleData.length; i++) {
    const d = visibleData[i];
    const x = i * candleSpacing;
    const isUp = d.close >= d.open;
    const color = isUp ? '#22c55e' : '#ef4444';

    const yHigh = chartTop + ((maxPrice - d.high) / priceRange) * chartHeight;
    const yLow = chartTop + ((maxPrice - d.low) / priceRange) * chartHeight;
    const yOpen = chartTop + ((maxPrice - d.open) / priceRange) * chartHeight;
    const yClose = chartTop + ((maxPrice - d.close) / priceRange) * chartHeight;

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + candleWidth / 2, yHigh);
    ctx.lineTo(x + candleWidth / 2, yLow);
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
    ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);
  }

  // Price labels right side
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'left';
  for (let i = 0; i <= 6; i++) {
    const price = minPrice + (priceRange / 6) * (6 - i);
    const y = chartTop + (chartHeight / 6) * i;
    ctx.fillText(price.toFixed(5), width - 58, y + 3);
  }

  // Time labels bottom
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'center';
  const timeStep = Math.floor(visibleData.length / 8);
  for (let i = 0; i < visibleData.length; i += timeStep) {
    const x = i * candleSpacing + candleWidth / 2;
    const date = visibleData[i].time;
    const label = date.slice(5);
    ctx.fillText(label, x, height - 8);
  }
}

export { candleData };
