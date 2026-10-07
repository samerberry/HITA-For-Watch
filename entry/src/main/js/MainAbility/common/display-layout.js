function dimension(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 280 && value <= 1000 ?
    Math.round(value) : fallback;
}

export function displayLayout(info) {
  const device = info || {};
  const width = dimension(device.windowWidth, 466);
  const height = dimension(device.windowHeight, 466);
  // Square resolution is not evidence of a round screen. Unknown shapes use safe round insets.
  const shape = device.screenShape === 'rect' ? 'rect' : 'circle';
  const round = shape === 'circle';
  const diameter = Math.min(width, height);
  const contentWidth = round ? Math.floor(diameter * 0.70) : width - 32;
  const topInset = round ? Math.ceil(height * 0.065) : 20;
  const topWidth = round ? Math.floor(diameter * 0.54) : width - 64;
  const headingWidth = Math.floor((topWidth - 44) * 0.60);
  const dayStep = Math.floor(contentWidth / 7);
  const listTop = topInset + 40 + 70 + 32;
  return {
    shape: shape, width: width, height: height,
    contentWidth: contentWidth, courseTextWidth: contentWidth - 28,
    topInset: topInset, topWidth: topWidth, headingWidth: headingWidth,
    weekLabelWidth: topWidth - headingWidth - 44,
    weekWidth: dayStep * 7, dayWidth: dayStep - 2,
    summaryWidth: contentWidth - 16, summaryTextWidth: contentWidth - 70,
    listTop: listTop, listHeight: height - listTop,
    footerHeight: round ? Math.ceil(height * 0.20) : 42,
    emptyHeight: 216,
    syncHeadingWidth: Math.min(contentWidth, 256),
    syncTitleWidth: Math.min(contentWidth, 256) - 48,
    syncBodyHeight: height - topInset - 50,
    syncIconSize: height < 420 ? 36 : 44,
    syncButtonWidth: Math.min(contentWidth, 248),
    syncBottomInset: round ? Math.ceil(height * 0.14) : 24,
    courseKindWidth: Math.max(90, contentWidth - 28 - 114)
  };
}
