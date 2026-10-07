export const NOW = Date.parse('2026-10-05T10:15:00+08:00');
export function fixture() {
  const event = (id, title, date, from, to, room, teacher, kind = 'CLASS') => ({
    id, title, room, teacher, kind, sections: kind !== 'CLASS' ? '' :
      (from === '08:00' ? '第1-2节' : from === '16:05' ? '第7-8节' : from === '10:05' ? '第3-4节' : '第5-6节'),
    startAt: Date.parse(`${date}T${from}:00+08:00`),
    endAt: Date.parse(`${date}T${to}:00+08:00`)
  });
  return {
    version: 1, timezone: 'Asia/Shanghai', generatedAt: NOW - 60000,
    rangeStart: '2026-10-05', rangeEnd: '2026-10-18',
    timetable: { id: 'preview', name: '2026秋季学期', campus: '威海', termStart: '2026-08-31' },
    events: [
      event('m1', '概率论与数理统计X', '2026-10-05', '10:05', '11:50', 'M楼-306', '张老师'),
      event('m2', '电路与电子技术（2）', '2026-10-05', '14:00', '15:45', 'M楼-104', '李老师'),
      event('m3', '离散数学', '2026-10-05', '16:05', '17:50', 'N楼-118', '王老师'),
      event('t1', '马克思主义基本原理', '2026-10-06', '08:00', '09:45', 'M楼-302', '陈老师'),
      event('w1', '大学物理X（2）', '2026-10-07', '10:05', '11:50', 'M楼-308', '刘老师'),
      event('w2', '大学英语期中考试', '2026-10-07', '14:00', '16:00', 'N楼-210', '', 'EXAM'),
      event('f1', '计算机系统基础与程序设计综合实验', '2026-10-09', '13:00', '15:30',
        '实验教学中心A区计算机实验室302', '课程教学组：张老师、李老师'),
      event('s1', '离散数学', '2026-10-11', '16:05', '17:50', 'N楼-118', '王老师')
    ]
  };
}
