// SUPERVISOR ATTENDANCE SCREEN
// Attendance check-in with selfie

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

export default function SupervisorAttendance() {
  const [checkedIn, setCheckedIn] = useState(false);
  
  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Current Time Card */}
        <Card style={styles.timeCard}>
          <Text style={styles.timeText}>{currentTime}</Text>
          <Text style={styles.dateText}>{currentDate}</Text>
        </Card>

        {/* Check In/Out Card */}
        <Card style={styles.attendanceCard}>
          {checkedIn ? (
            <>
              <View style={styles.checkedInIcon}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
              </View>
              <Text style={styles.checkedInTitle}>You're Checked In!</Text>
              <Text style={styles.checkedInTime}>Check-in time: 9:00 AM</Text>
              <View style={styles.locationInfo}>
                <Ionicons name="location" size={16} color={Colors.textMuted} />
                <Text style={styles.locationText}>City Tower Construction Site</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.checkInIcon}>
                <Ionicons name="finger-print" size={64} color={Colors.accent} />
              </View>
              <Text style={styles.checkInTitle}>Mark Your Attendance</Text>
              <Text style={styles.checkInSubtitle}>Take a selfie to verify your presence</Text>
              
              <TouchableOpacity 
                style={styles.checkInButton}
                onPress={() => setCheckedIn(true)}
              >
                <Ionicons name="camera" size={24} color={Colors.white} />
                <Text style={styles.checkInButtonText}>Check In with Selfie</Text>
              </TouchableOpacity>
            </>
          )}
        </Card>

        {/* Attendance History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Attendance</Text>
          
          <AttendanceHistoryItem
            date="Today"
            checkIn="9:00 AM"
            status="present"
          />
          <AttendanceHistoryItem
            date="Yesterday"
            checkIn="8:45 AM"
            status="present"
          />
          <AttendanceHistoryItem
            date="Jan 15, 2025"
            checkIn="-"
            status="absent"
          />
          <AttendanceHistoryItem
            date="Jan 14, 2025"
            checkIn="9:15 AM"
            status="late"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AttendanceHistoryItem({ 
  date, 
  checkIn, 
  status 
}: { 
  date: string; 
  checkIn: string; 
  status: 'present' | 'absent' | 'late';
}) {
  const statusColors = {
    present: Colors.success,
    absent: Colors.error,
    late: Colors.warning,
  };
  
  const statusLabels = {
    present: 'Present',
    absent: 'Absent',
    late: 'Late',
  };

  return (
    <Card style={styles.historyCard}>
      <View style={styles.historyContent}>
        <View style={styles.historyDate}>
          <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.historyDateText}>{date}</Text>
        </View>
        <View style={styles.historyTime}>
          <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.historyTimeText}>{checkIn}</Text>
        </View>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusColors[status] + '20' }]}>
        <Text style={[styles.statusText, { color: statusColors[status] }]}>
          {statusLabels[status]}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
  },
  timeCard: {
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.secondary,
    marginBottom: Spacing.md,
  },
  timeText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.white,
  },
  dateText: {
    fontSize: FontSizes.md,
    color: Colors.white + 'CC',
    marginTop: Spacing.xs,
  },
  attendanceCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  checkInIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.accentLight + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  checkInTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    color: Colors.text,
  },
  checkInSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  checkInButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.white,
  },
  checkedInIcon: {
    marginBottom: Spacing.md,
  },
  checkedInTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    color: Colors.success,
  },
  checkedInTime: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  locationText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  historyContent: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  historyDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  historyDateText: {
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  historyTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  historyTimeText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
});
