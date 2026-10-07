import { dayKey, monthDay, weekDays, selectedDayView } from './schedule.js';

function lines(text, units) {
  let count = 0;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === '\n') {
      total += Math.max(1, Math.ceil(count / units));
      count = 0;
    } else {
      count += text.charCodeAt(i) < 128 && 'MW@%'.indexOf(text.charAt(i)) < 0 ? 0.65 : 1;
    }
  }
  return total + Math.max(1, Math.ceil(count / units));
}

export function viewData(snapshot, selected, now, layout) {
  const view = selectedDayView(snapshot, selected, now);
  const textWidth = layout ? layout.courseTextWidth : 294;
  const contentWidth = layout ? layout.contentWidth : 320;
  const name = snapshot ? snapshot.timetable.name : '还没有课表';
  const campus = snapshot ? snapshot.timetable.campus : '';
  const range = snapshot ? monthDay(snapshot.rangeStart) + ' - ' + monthDay(snapshot.rangeEnd) : '';
  return {
    days: weekDays(now, selected, snapshot),
    heading: view.heading,
    weekLabel: view.weekLabel,
    subtitle: view.weekday + (view.countText ? ' · ' + view.countText : ''),
    events: view.events.map(function(event) {
      event.roomLabel = '教室  ' + event.room;
      event.teacherLabel = '教师  ' + event.teacher;
      event.titleHeight = lines(event.title, Math.max(1, Math.floor((textWidth - 12) / 27))) * 34 + 2;
      event.roomHeight = lines(event.roomLabel, Math.max(1, Math.floor((textWidth - 12) / 22))) * 28 + 2;
      event.teacherHeight = lines(event.teacherLabel, Math.max(1, Math.floor((textWidth - 12) / 22))) * 28 + 2;
      return event;
    }),
    emptyTitle: view.emptyTitle,
    emptyText: view.emptyText,
    hasEvents: view.events.length > 0,
    hasSnapshot: !!snapshot,
    syncText: view.syncText,
    selectedIsToday: selected === dayKey(now),
    timetableName: name, campus: campus, rangeText: range,
    savedTitleHeight: lines(name, Math.max(1, Math.floor((contentWidth - 12) / 20))) * 26,
    savedRangeHeight: lines(campus + ' ' + range,
      Math.max(1, Math.floor((contentWidth - 12) / 18))) * 24
  };
}
