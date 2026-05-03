import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { AppHeader } from '../../src/components/AppHeader';
import { api } from '../../src/api/client';

// Types matching backend CalendarActivity
interface Activity {
  id: string; source: 'event'|'poll'|'tournament'; title: string;
  startsAt: string; endsAt: string|null; isAllDay: boolean;
  locationName: string|null; myResponse: string|null;
  href: string; isExternal: boolean; activityType: string|null;
  level: string|null; classes: string|null; sourceId: string;
  participantCount: number|null; maxParticipants: number|null;
  registrationOpen: boolean|null; externalUrl: string|null;
  startTimeText: string|null; registrationDeadline: string|null;
}

type ViewMode = 'month' | 'week' | 'day';
type FilterKey = 'booked'|'invited'|'interested'|'open'|'tournaments';

const FILTERS: {key: FilterKey; label: string; icon: string}[] = [
  { key: 'booked', label: 'Mina spel', icon: 'checkmark-circle' },
  { key: 'invited', label: 'Inbjudningar', icon: 'mail' },
  { key: 'interested', label: 'Intresserad', icon: 'star' },
  { key: 'open', label: 'Öppna event', icon: 'globe' },
  { key: 'tournaments', label: 'Profixio', icon: 'trophy' },
];

const MONTHS = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
const WDAYS = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];

function dk(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayK() { return dk(new Date()); }
function mondayIdx(d: Date) { return (d.getDay()+6)%7; }
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay()||7;
  t.setUTCDate(t.getUTCDate()+4-day);
  const y = new Date(Date.UTC(t.getUTCFullYear(),0,1));
  return Math.ceil((((t.getTime()-y.getTime())/86400000)+1)/7);
}

function accentColor(a: Activity) {
  if (a.source === 'event') return Colors.brandPrimaryLight;
  if (a.source === 'poll') return Colors.brandAccent;
  return '#6b7a99';
}

function filterActivity(a: Activity, filters: Set<FilterKey>): boolean {
  if (a.source === 'tournament') return filters.has('tournaments') || (a.myResponse === 'interested' && filters.has('interested'));
  if (a.myResponse === 'yes') return filters.has('booked');
  if (a.myResponse === 'interested') return filters.has('interested');
  if (a.myResponse === 'invited') return filters.has('invited');
  if (a.myResponse === null) return filters.has('open');
  return false;
}

export default function CalendarScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>('month');
  const [selectedDay, setSelectedDay] = useState(todayK());
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set(['booked']));

  const load = useCallback(async (refresh = false) => {
    try {
      const data = await api.get<{activities: Activity[]}>('/api/mobile/calendar');
      setActivities(data.activities || []);
    } catch (e) { console.warn('Calendar load error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const visible = useMemo(() => activities.filter(a => filterActivity(a, filters)), [activities, filters]);

  const toggleFilter = (k: FilterKey) => {
    setFilters(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AppHeader />
      <View style={s.titleRow}>
        <Text style={s.title}>Kalender</Text>
        <Text style={s.subtitle}>Ditt beach-schema</Text>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
        {FILTERS.map(f => {
          const active = filters.has(f.key);
          return (
            <TouchableOpacity key={f.key} style={[s.chip, active && s.chipActive]} onPress={() => toggleFilter(f.key)}>
              <Text style={[s.chipText, active && s.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* View switcher */}
      <View style={s.viewSwitcher}>
        {(['month','week','day'] as ViewMode[]).map(v => (
          <TouchableOpacity key={v} style={[s.viewBtn, view===v && s.viewBtnActive]} onPress={() => setView(v)}>
            <Text style={[s.viewBtnText, view===v && s.viewBtnTextActive]}>
              {v==='month'?'Månad':v==='week'?'Vecka':'Dag'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandPrimary}/>}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.brandPrimary}/></View>
        ) : view === 'month' ? (
          <MonthView activities={visible} selectedDay={selectedDay} onSelectDay={setSelectedDay}/>
        ) : view === 'week' ? (
          <WeekView activities={visible} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenDay={d => { setSelectedDay(d); setView('day'); }}/>
        ) : (
          <DayView activities={visible} selectedDay={selectedDay} onSelectDay={setSelectedDay}/>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── MONTH VIEW ─────────────────────────────────
function MonthView({ activities, selectedDay, onSelectDay }: { activities: Activity[]; selectedDay: string; onSelectDay: (d:string)=>void }) {
  const focus = new Date(selectedDay + 'T12:00:00');
  const yr = focus.getFullYear(), mo = focus.getMonth();
  const first = new Date(yr, mo, 1);
  const lead = mondayIdx(first);
  const dim = new Date(yr, mo+1, 0).getDate();
  const total = Math.ceil((lead+dim)/7)*7;
  const today = todayK();

  const byDay = useMemo(() => {
    const m = new Map<string, Activity[]>();
    activities.forEach(a => { const k = dk(new Date(a.startsAt)); m.set(k, [...(m.get(k)||[]), a]); });
    return m;
  }, [activities]);

  const goPrev = () => onSelectDay(dk(new Date(yr, mo-1, 1)));
  const goNext = () => onSelectDay(dk(new Date(yr, mo+1, 1)));

  const selActs = byDay.get(selectedDay) || [];
  const selDate = new Date(selectedDay + 'T12:00:00');

  return (
    <View>
      {/* Nav header */}
      <View style={s.navHeader}>
        <TouchableOpacity onPress={goPrev} style={s.navBtn}><Ionicons name="chevron-back" size={20} color={Colors.textPrimary}/></TouchableOpacity>
        <Text style={s.navTitle}>{MONTHS[mo]} {yr}</Text>
        <TouchableOpacity onPress={goNext} style={s.navBtn}><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary}/></TouchableOpacity>
        <TouchableOpacity onPress={() => onSelectDay(todayK())} style={s.todayBtn}><Text style={s.todayBtnText}>Idag</Text></TouchableOpacity>
      </View>

      {/* Weekday header */}
      <View style={s.wdayRow}>
        <Text style={[s.wdayCell, s.weekNumCell]}>v.</Text>
        {WDAYS.map(d => <Text key={d} style={s.wdayCell}>{d}</Text>)}
      </View>

      {/* Grid */}
      {Array.from({ length: total/7 }, (_, r) => {
        const cells = Array.from({length:7}, (_,i) => new Date(yr, mo, 1-lead+r*7+i));
        const wn = isoWeek(cells[0]);
        return (
          <View key={r} style={s.monthRow}>
            <Text style={[s.wdayCell, s.weekNumCell, s.weekNum]}>{wn}</Text>
            {cells.map(d => {
              const k = dk(d);
              const inMonth = d.getMonth() === mo;
              const isToday = k === today;
              const isSel = k === selectedDay;
              const acts = byDay.get(k) || [];
              return (
                <TouchableOpacity key={k} style={[s.dayCell, !inMonth && s.dayOutside, isSel && s.daySel]} onPress={() => onSelectDay(k)}>
                  <Text style={[s.dayNum, isToday && s.dayToday, isSel && s.dayNumSel]}>{d.getDate()}</Text>
                  {acts.length > 0 && (
                    <View style={s.dotRow}>
                      {acts.slice(0,3).map((a,i) => <View key={i} style={[s.dot, {backgroundColor: accentColor(a)}]}/>)}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}

      {/* Selected day detail */}
      <View style={s.dayDetail}>
        <Text style={s.dayDetailTitle}>
          {selDate.toLocaleDateString('sv-SE', {weekday:'long', day:'numeric', month:'long'})}
        </Text>
        {selActs.length === 0 ? (
          <Text style={s.empty}>Inga aktiviteter den här dagen.</Text>
        ) : (
          selActs.map(a => <ActivityCard key={a.id} activity={a}/>)
        )}
      </View>
    </View>
  );
}

// ─── WEEK VIEW ─────────────────────────────────
function WeekView({ activities, selectedDay, onSelectDay, onOpenDay }: { activities: Activity[]; selectedDay: string; onSelectDay: (d:string)=>void; onOpenDay: (d:string)=>void }) {
  const focus = new Date(selectedDay + 'T12:00:00');
  const mon = new Date(focus); mon.setDate(focus.getDate() - mondayIdx(focus));
  const days = Array.from({length:7}, (_,i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d; });
  const today = todayK();

  const byDay = useMemo(() => {
    const m = new Map<string, Activity[]>();
    activities.forEach(a => { const k = dk(new Date(a.startsAt)); m.set(k, [...(m.get(k)||[]), a]); });
    return m;
  }, [activities]);

  const shift = (delta: number) => { const n = new Date(mon); n.setDate(mon.getDate()+delta*7); onSelectDay(dk(n)); };
  const wn = isoWeek(mon);
  const label = `V.${wn} · ${mon.getDate()} ${MONTHS[mon.getMonth()].slice(0,3)}–${days[6].getDate()} ${MONTHS[days[6].getMonth()].slice(0,3)} ${days[6].getFullYear()}`;

  return (
    <View>
      <View style={s.navHeader}>
        <TouchableOpacity onPress={() => shift(-1)} style={s.navBtn}><Ionicons name="chevron-back" size={20} color={Colors.textPrimary}/></TouchableOpacity>
        <Text style={[s.navTitle, {fontSize: 14}]}>{label}</Text>
        <TouchableOpacity onPress={() => shift(1)} style={s.navBtn}><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary}/></TouchableOpacity>
        <TouchableOpacity onPress={() => onSelectDay(todayK())} style={s.todayBtn}><Text style={s.todayBtnText}>Idag</Text></TouchableOpacity>
      </View>
      {days.map(d => {
        const k = dk(d);
        const acts = byDay.get(k) || [];
        const isToday = k === today;
        return (
          <TouchableOpacity key={k} style={[s.weekDayRow, isToday && {borderLeftColor: Colors.brandPrimary, borderLeftWidth: 3}]} onPress={() => onOpenDay(k)}>
            <View style={s.weekDayHead}>
              <Text style={[s.weekDayName, isToday && {color: Colors.brandPrimary}]}>{WDAYS[mondayIdx(d)]}</Text>
              <Text style={[s.weekDayNum, isToday && {color: Colors.brandPrimary, fontWeight:'700'}]}>{d.getDate()}</Text>
            </View>
            <View style={s.weekDayActs}>
              {acts.length === 0 ? <Text style={s.weekDayEmpty}>—</Text> : acts.slice(0,3).map(a => (
                <View key={a.id} style={[s.weekActChip, {borderLeftColor: accentColor(a)}]}>
                  <Text style={s.weekActText} numberOfLines={1}>{formatTime(a)} {a.title}</Text>
                </View>
              ))}
              {acts.length > 3 && <Text style={s.weekMore}>+{acts.length-3} mer</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── DAY VIEW ─────────────────────────────────
function DayView({ activities, selectedDay, onSelectDay }: { activities: Activity[]; selectedDay: string; onSelectDay: (d:string)=>void }) {
  const date = new Date(selectedDay + 'T12:00:00');
  const dayActs = useMemo(() => activities.filter(a => {
    const sk = dk(new Date(a.startsAt));
    const ek = a.endsAt ? dk(new Date(a.endsAt)) : sk;
    return selectedDay >= sk && selectedDay <= ek;
  }), [activities, selectedDay]);

  const shift = (d: number) => { const n = new Date(date); n.setDate(n.getDate()+d); onSelectDay(dk(n)); };

  return (
    <View>
      <View style={s.navHeader}>
        <TouchableOpacity onPress={() => shift(-1)} style={s.navBtn}><Ionicons name="chevron-back" size={20} color={Colors.textPrimary}/></TouchableOpacity>
        <Text style={s.navTitle}>{date.toLocaleDateString('sv-SE', {weekday:'long', day:'numeric', month:'long'})}</Text>
        <TouchableOpacity onPress={() => shift(1)} style={s.navBtn}><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary}/></TouchableOpacity>
        <TouchableOpacity onPress={() => onSelectDay(todayK())} style={s.todayBtn}><Text style={s.todayBtnText}>Idag</Text></TouchableOpacity>
      </View>
      {dayActs.length === 0 ? (
        <View style={s.center}><Text style={s.empty}>Inga aktiviteter den här dagen.</Text></View>
      ) : (
        dayActs.map(a => <ActivityCard key={a.id} activity={a}/>)
      )}
    </View>
  );
}

// ─── ACTIVITY CARD ─────────────────────────────
function formatTime(a: Activity) {
  if (a.isAllDay) return 'Heldag';
  if (a.startTimeText) return `kl ${a.startTimeText}`;
  const d = new Date(a.startsAt);
  return d.toLocaleTimeString('sv-SE', {hour:'2-digit', minute:'2-digit'});
}

function ActivityCard({ activity: a }: { activity: Activity }) {
  const accent = accentColor(a);
  const filled = a.myResponse === 'yes';
  const isTournament = a.source === 'tournament';
  const count = a.participantCount != null
    ? (a.maxParticipants ? `${a.participantCount}/${a.maxParticipants}` : `${a.participantCount}`) + (isTournament ? ' lag' : ' spelare')
    : null;
  const tag = filled ? 'Bokad' : a.myResponse === 'interested' ? 'Intresserad' : a.myResponse === 'invited' ? 'Inbjuden' : a.isExternal ? 'Profixio' : a.myResponse === null ? 'Öppet' : null;
  const tagColor = filled ? Colors.success : a.myResponse === 'interested' ? Colors.warning : a.myResponse === 'invited' ? Colors.info : a.isExternal ? '#6b7a99' : Colors.brandAccent;

  return (
    <TouchableOpacity
      style={[s.card, {borderLeftColor: accent, backgroundColor: filled ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.03)'}]}
      onPress={() => { if (a.externalUrl) Linking.openURL(a.externalUrl); }}
      activeOpacity={0.7}
    >
      <View style={s.cardTop}>
        <Text style={s.cardTitle} numberOfLines={2}>{a.title}</Text>
        {tag && <View style={[s.tag, {backgroundColor: `${tagColor}22`}]}><Text style={[s.tagText, {color: tagColor}]}>{tag}</Text></View>}
      </View>
      <View style={s.cardMeta}>
        <Ionicons name="time-outline" size={12} color={Colors.textTertiary}/>
        <Text style={s.metaText}>{formatTime(a)}</Text>
      </View>
      {a.locationName && (
        <View style={s.cardMeta}>
          <Ionicons name="location-outline" size={12} color={Colors.brandPink}/>
          <Text style={s.metaText}>{a.locationName}</Text>
        </View>
      )}
      {count && (
        <View style={s.cardMeta}>
          <Ionicons name="people-outline" size={12} color={Colors.brandAccent}/>
          <Text style={s.metaText}>{count}</Text>
        </View>
      )}
      {a.level && (
        <View style={s.cardMeta}>
          <Ionicons name="ribbon-outline" size={12} color={Colors.warning}/>
          <Text style={s.metaText}>{a.level}</Text>
        </View>
      )}
      {isTournament && a.registrationOpen && a.externalUrl && (
        <View style={[s.cardMeta, {marginTop: 4}]}>
          <View style={s.regBadge}><Text style={s.regBadgeText}>● Anmälan öppen</Text></View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── STYLES ─────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  titleRow: { paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  scroll: { flex: 1 },
  center: { padding: 40, alignItems: 'center' },
  empty: { color: Colors.textTertiary, fontSize: 14, textAlign: 'center', marginTop: 12 },

  // Filters
  filterScroll: { maxHeight: 44, marginTop: 10 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bgTertiary, borderWidth: 1, borderColor: Colors.borderSubtle },
  chipActive: { backgroundColor: 'rgba(0,229,255,0.15)', borderColor: Colors.brandNeon },
  chipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: Colors.brandNeon },

  // View switcher
  viewSwitcher: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, marginBottom: 6, backgroundColor: Colors.bgTertiary, borderRadius: 10, padding: 3 },
  viewBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  viewBtnActive: { backgroundColor: Colors.brandNeon },
  viewBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  viewBtnTextActive: { color: Colors.bgPrimary },

  // Nav header
  navHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  navBtn: { padding: 6 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: Colors.bgTertiary },
  todayBtnText: { fontSize: 12, fontWeight: '600', color: Colors.brandNeon },

  // Month grid
  wdayRow: { flexDirection: 'row', paddingHorizontal: 4 },
  wdayCell: { flex: 1, textAlign: 'center', fontSize: 11, color: Colors.textTertiary, fontWeight: '600', paddingVertical: 4 },
  weekNumCell: { width: 28, flex: 0 },
  weekNum: { color: Colors.textTertiary, fontSize: 10 },
  monthRow: { flexDirection: 'row', paddingHorizontal: 4 },
  dayCell: { flex: 1, minHeight: 48, paddingVertical: 4, alignItems: 'center', borderRadius: 6 },
  dayOutside: { opacity: 0.3 },
  daySel: { backgroundColor: 'rgba(0,229,255,0.12)' },
  dayNum: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  dayToday: { color: Colors.brandNeon, fontWeight: '800' },
  dayNumSel: { fontWeight: '800' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },

  // Day detail
  dayDetail: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, marginTop: 8 },
  dayDetailTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10, textTransform: 'capitalize' },

  // Activity card
  card: { borderLeftWidth: 3, borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, flex: 1, marginRight: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tagText: { fontSize: 10, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  regBadge: { backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  regBadgeText: { fontSize: 11, color: Colors.success, fontWeight: '600' },

  // Week view
  weekDayRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  weekDayHead: { width: 48, alignItems: 'center' },
  weekDayName: { fontSize: 11, color: Colors.textTertiary, fontWeight: '600' },
  weekDayNum: { fontSize: 18, color: Colors.textPrimary, fontWeight: '500' },
  weekDayActs: { flex: 1, paddingLeft: 10 },
  weekDayEmpty: { color: Colors.textTertiary, fontSize: 13 },
  weekActChip: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 3, marginBottom: 3 },
  weekActText: { fontSize: 13, color: Colors.textPrimary },
  weekMore: { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
});
