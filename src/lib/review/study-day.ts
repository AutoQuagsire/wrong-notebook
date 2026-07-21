const DEFAULT_BOUNDARY_HOUR = 6;

export function getStudyDayStart(
    referenceTime: Date,
    boundaryHour: number = DEFAULT_BOUNDARY_HOUR,
): Date {
    const start = new Date(referenceTime);
    start.setHours(boundaryHour, 0, 0, 0);

    if (referenceTime.getTime() < start.getTime()) {
        start.setDate(start.getDate() - 1);
    }

    return start;
}

export function getStudyDayEnd(
    referenceTime: Date,
    boundaryHour: number = DEFAULT_BOUNDARY_HOUR,
): Date {
    const end = getStudyDayStart(referenceTime, boundaryHour);
    end.setDate(end.getDate() + 1);
    return end;
}

export function getStudyDayStartForDue(
    due: Date,
    boundaryHour: number = DEFAULT_BOUNDARY_HOUR,
): Date {
    return getStudyDayStart(due, boundaryHour);
}

export function addStudyDays(
    referenceTime: Date,
    days: number,
    boundaryHour: number = DEFAULT_BOUNDARY_HOUR,
): Date {
    const due = getStudyDayStart(referenceTime, boundaryHour);
    due.setDate(due.getDate() + days);
    return due;
}
