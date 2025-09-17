var fs = require('fs');
const raw = JSON.parse(fs.readFileSync('as1.json', 'utf8'));

// Support both legacy array shape and new { config, students } shape
const students = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.students) ? raw.students : []);
const cfg = Array.isArray(raw) ? {} : (raw && raw.config ? raw.config : {});

const attendanceRateThreshold = typeof cfg.attendanceRateThreshold === 'number' ? cfg.attendanceRateThreshold : 0.75;
const assignmentRateThreshold = typeof cfg.assignmentRateThreshold === 'number' ? cfg.assignmentRateThreshold : 0.5;
const failedContactsThreshold = typeof cfg.failedContactsThreshold === 'number' ? cfg.failedContactsThreshold : 2;
const riskLabels = cfg.riskLabels && typeof cfg.riskLabels === 'object' ? cfg.riskLabels : { "3": "High", "2": "Medium", "1": "Low", "0": "Low" };

function getRiskLabel(score) {
    const key = String(score);
    if (Object.prototype.hasOwnProperty.call(riskLabels, key)) return riskLabels[key];
    return "Low";
}

console.log("Student ID | Score | Risk Level")

students.forEach(student => {
	// console.log(student.student_name);
	let score = 0;
	let attendRate = 0;
	let assignmentRate = 0;
	let contactRate = 0;
	student.attendance.forEach(attendance => {
		if (attendance.status === 'ATTEND') {
			attendRate++;
		}
	});
	student.assignments.forEach(assignment => {
		if (assignment.submitted) {
			assignmentRate++;
		}
	});
	student.contacts.forEach(contact => {
		if (contact.status === 'FAILED') {
			contactRate++;
		}
	});
	if (student.attendance.length > 0 && attendRate / student.attendance.length < attendanceRateThreshold) score++;
	if (student.assignments.length > 0 && assignmentRate / student.assignments.length < assignmentRateThreshold) score++;
	if (contactRate >= failedContactsThreshold) score++;
	const riskLabel = getRiskLabel(score);
	console.log(student.student_id + " | " + score + " | " + riskLabel);
});

