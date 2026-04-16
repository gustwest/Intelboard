"""
The Insiders Insights — Data Analysis Engine
=============================================
Parses all LinkedIn export formats and produces structured analysis per area:
  1. Content & Engagement
  2. Audience (Followers + Visitors)
  3. Paid Media (Campaign Manager)
  4. Recruitment (Recruiter + Pipeline)
  5. Competitors (Benchmark)
  6. Talent Market (Talent Insights)
  + Aggregated Health Score
"""

import os
import json
import unicodedata
import codecs
import csv
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import numpy as np

# Conditional imports - these might not be available in all environments
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    import xlrd
    HAS_XLRD = True
except ImportError:
    HAS_XLRD = False


# ============================================================
# FILE DETECTION & PARSING
# ============================================================

def detect_file_type(filename: str) -> str:
    """Classify a file into its LinkedIn data category."""
    lower = filename.lower()
    
    # Content
    if '_content_' in lower and lower.endswith('.xls'):
        return 'content'
    
    # Visitors
    if '_visitors_' in lower and lower.endswith('.xls'):
        return 'visitors'
    
    # Followers
    if '_followers_' in lower and lower.endswith('.xls'):
        return 'followers'
    
    # Competitor analytics
    if 'competitor_analytics' in lower and lower.endswith('.xlsx'):
        return 'competitors'
    
    # Campaign Manager reports (UTF-16 CSV)
    if 'campaign_performance_report' in lower and lower.endswith('.csv'):
        return 'campaign_performance'
    if 'creative_performance_report' in lower and lower.endswith('.csv'):
        return 'creative_performance'
    if 'campaign_placement_report' in lower and lower.endswith('.csv'):
        return 'campaign_placement'
    if 'creative_placement_report' in lower and lower.endswith('.csv'):
        return 'creative_placement'
    if 'lan_campaign_performance' in lower and lower.endswith('.csv'):
        return 'lan_campaign_performance'
    if 'lan_creative_performance' in lower and lower.endswith('.csv'):
        return 'lan_creative_performance'
    if 'demographics_report' in lower and lower.endswith('.csv'):
        return 'demographics'
    if 'companies-export' in lower and lower.endswith('.csv'):
        return 'companies_export'
    if 'conversion_performance' in lower and 'creative' not in lower:
        return 'conversion_performance'
    if 'creative_conversion' in lower:
        return 'creative_conversion'
    if 'conversation_ads' in lower:
        return 'conversation_ads'
    
    # Recruitment
    if 'inmail_report' in lower and lower.endswith('.xlsx'):
        return 'inmail_report'
    if 'pipeline_report' in lower and lower.endswith('.xlsx'):
        return 'pipeline_report'
    if 'funnel_report' in lower and lower.endswith('.xlsx'):
        return 'funnel_report'
    if 'recruiter_usage' in lower and lower.endswith('.xlsx'):
        return 'recruiter_usage'
    if 'custom_report_user' in lower and lower.endswith('.csv'):
        return 'recruiter_custom'
    
    # Talent Insights
    if 'talent insights' in lower and lower.endswith('.csv'):
        return 'talent_insights'
    
    return 'unknown'


def extract_customer_name(filename: str) -> str:
    """Extract customer name from filename pattern."""
    # Normalize Unicode (macOS uses NFD decomposition for filenames)
    normalized = unicodedata.normalize('NFC', filename)
    lower = normalized.lower()
    
    if 'malmostad' in lower or 'malmö stad' in lower or 'malmö' in lower or 'malmo' in lower:
        return 'Malmö stad'
    if 'coromatic' in lower:
        return 'Coromatic AB'
    if 'account_503247325' in lower or 'companies-export_503247325' in lower:
        return 'Malmö stad (Ads)'
    
    return 'Unknown'


def read_utf16_csv(filepath: str, skip_header_rows: int = 7) -> List[Dict]:
    """Read LinkedIn Campaign Manager CSV files (UTF-16LE with BOM, tab-delimited)."""
    rows = []
    try:
        with codecs.open(filepath, 'r', encoding='utf-16') as f:
            lines = f.readlines()
        
        if len(lines) <= skip_header_rows:
            return []
        
        # Find the header row (first row after metadata)
        data_lines = lines[skip_header_rows:]
        if not data_lines:
            return []
        
        reader = csv.DictReader(data_lines, delimiter='\t')
        for row in reader:
            cleaned = {k.strip(): v.strip() if v else '' for k, v in row.items() if k}
            if cleaned:
                rows.append(cleaned)
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
    
    return rows


def read_xls_file(filepath: str, sheet_name: str = None, header_row: int = 0) -> Optional[Any]:
    """Read XLS file using pandas + xlrd."""
    if not HAS_PANDAS or not HAS_XLRD:
        return None
    try:
        return pd.read_excel(filepath, engine='xlrd', sheet_name=sheet_name, header=header_row)
    except Exception as e:
        print(f"Error reading XLS {filepath}: {e}")
        return None


def read_xlsx_file(filepath: str, sheet_name: str = None) -> Optional[Any]:
    """Read XLSX file using pandas + openpyxl."""
    if not HAS_PANDAS:
        return None
    try:
        return pd.read_excel(filepath, engine='openpyxl', sheet_name=sheet_name)
    except Exception as e:
        print(f"Error reading XLSX {filepath}: {e}")
        return None


# ============================================================
# AREA 1: CONTENT & ENGAGEMENT
# ============================================================

def analyze_content(files: Dict[str, str]) -> Dict[str, Any]:
    """Analyze content performance data from Company Page exports."""
    results = {}
    
    for customer, filepath in files.items():
        df = read_xls_file(filepath, sheet_name='All posts', header_row=1)
        if df is None or df.empty:
            continue
        
        # Normalize column names
        cols = {c: c.strip() for c in df.columns}
        df = df.rename(columns=cols)
        
        total_posts = len(df)
        
        # Safely get numeric columns
        def safe_numeric(col_name):
            if col_name in df.columns:
                return pd.to_numeric(df[col_name], errors='coerce').fillna(0)
            return pd.Series([0] * len(df))
        
        impressions = safe_numeric('Impressions')
        clicks = safe_numeric('Clicks')
        likes = safe_numeric('Likes')
        comments = safe_numeric('Comments')
        reposts = safe_numeric('Reposts')
        follows = safe_numeric('Follows')
        
        # Engagement rate
        eng_rate_col = safe_numeric('Engagement rate')
        
        # Content type breakdown
        type_stats = {}
        if 'Post type' in df.columns:
            for ptype, group in df.groupby('Post type'):
                g_imp = safe_numeric('Impressions').loc[group.index]
                g_clicks = safe_numeric('Clicks').loc[group.index]
                g_likes = safe_numeric('Likes').loc[group.index]
                g_comments = safe_numeric('Comments').loc[group.index]
                g_reposts = safe_numeric('Reposts').loc[group.index]
                g_eng = safe_numeric('Engagement rate').loc[group.index]
                
                type_stats[str(ptype)] = {
                    'count': len(group),
                    'avg_impressions': round(float(g_imp.mean()), 0),
                    'avg_clicks': round(float(g_clicks.mean()), 1),
                    'avg_likes': round(float(g_likes.mean()), 1),
                    'avg_comments': round(float(g_comments.mean()), 1),
                    'avg_reposts': round(float(g_reposts.mean()), 1),
                    'avg_engagement_rate': round(float(g_eng.mean()), 4),
                    'total_impressions': int(g_imp.sum()),
                }
        
        # Top & bottom performers
        if 'Post title' in df.columns and not impressions.empty:
            df['_impressions'] = impressions
            df['_engagement'] = eng_rate_col
            
            top_posts = df.nlargest(10, '_engagement')[['Post title', '_impressions', '_engagement', 'Post type']].to_dict('records')
            bottom_posts = df.nsmallest(10, '_engagement')[['Post title', '_impressions', '_engagement', 'Post type']].to_dict('records')
        else:
            top_posts = []
            bottom_posts = []
        
        # Timing analysis
        timing = {}
        if 'Created date' in df.columns:
            df['_created'] = pd.to_datetime(df['Created date'], errors='coerce')
            df['_dow'] = df['_created'].dt.day_name()
            df['_hour'] = df['_created'].dt.hour
            
            for dow, group in df.groupby('_dow'):
                g_eng = safe_numeric('Engagement rate').loc[group.index]
                timing[str(dow)] = {
                    'count': len(group),
                    'avg_engagement_rate': round(float(g_eng.mean()), 4),
                    'avg_impressions': round(float(safe_numeric('Impressions').loc[group.index].mean()), 0),
                }
        
        # Monthly trend
        monthly_trend = []
        if '_created' in df.columns:
            df['_month'] = df['_created'].dt.to_period('M')
            for month, group in df.groupby('_month'):
                g_imp = safe_numeric('Impressions').loc[group.index]
                g_eng = safe_numeric('Engagement rate').loc[group.index]
                monthly_trend.append({
                    'month': str(month),
                    'posts': len(group),
                    'total_impressions': int(g_imp.sum()),
                    'avg_engagement_rate': round(float(g_eng.mean()), 4),
                })
        
        # Engagement quality pyramid
        total_impressions = int(impressions.sum())
        total_clicks = int(clicks.sum())
        total_likes = int(likes.sum())
        total_comments = int(comments.sum())
        total_reposts = int(reposts.sum())
        total_follows = int(follows.sum())
        total_engagements = total_clicks + total_likes + total_comments + total_reposts + total_follows
        
        engagement_pyramid = {
            'impressions': total_impressions,
            'clicks': total_clicks,
            'reactions': total_likes,
            'comments': total_comments,
            'shares': total_reposts,
            'follows': total_follows,
            'engagement_depth': round(
                (total_comments + total_reposts) / max(total_engagements, 1), 3
            ),
        }
        
        # Virality
        virality = {
            'avg_virality_rate': 0,  # Would need viral impressions data
        }
        
        results[customer] = {
            'total_posts': total_posts,
            'total_impressions': total_impressions,
            'avg_impressions_per_post': round(total_impressions / max(total_posts, 1), 0),
            'avg_engagement_rate': round(float(eng_rate_col.mean()), 4),
            'content_type_breakdown': type_stats,
            'timing_analysis': timing,
            'monthly_trend': monthly_trend,
            'engagement_pyramid': engagement_pyramid,
            'top_performers': top_posts[:5],
            'bottom_performers': bottom_posts[:5],
            'score': _calc_content_score(
                float(eng_rate_col.mean()), total_posts, total_impressions,
                (total_comments + total_reposts) / max(total_engagements, 1)
            ),
        }
    
    return results


def _calc_content_score(avg_eng_rate: float, total_posts: int, total_impressions: int, depth: float) -> int:
    """Calculate Content area score (0-100)."""
    # Engagement rate score (0-40): 5% = perfect
    eng_score = min(avg_eng_rate / 0.05, 1.0) * 40
    
    # Volume score (0-20): 12 posts/month = good
    volume_score = min(total_posts / 12, 1.0) * 20
    
    # Reach score (0-20): 100k impressions = good
    reach_score = min(total_impressions / 100_000, 1.0) * 20
    
    # Depth score (0-20): 30%+ deep engagement = excellent
    depth_score = min(depth / 0.30, 1.0) * 20
    
    return min(int(eng_score + volume_score + reach_score + depth_score), 100)


# ============================================================
# AREA 2: AUDIENCE (Followers + Visitors)
# ============================================================

def analyze_audience(follower_files: Dict[str, str], visitor_files: Dict[str, str]) -> Dict[str, Any]:
    """Analyze audience data from follower and visitor exports."""
    results = {}
    
    for customer in set(list(follower_files.keys()) + list(visitor_files.keys())):
        customer_data = {'followers': {}, 'visitors': {}, 'demographics': {}}
        
        # --- FOLLOWERS ---
        if customer in follower_files:
            xl_path = follower_files[customer]
            
            # New followers timeline
            df = read_xls_file(xl_path, sheet_name='New followers')
            if df is not None and not df.empty:
                total_organic = int(pd.to_numeric(df.get('Organic followers', 0), errors='coerce').fillna(0).sum())
                total_sponsored = int(pd.to_numeric(df.get('Sponsored followers', 0), errors='coerce').fillna(0).sum())
                total_auto = int(pd.to_numeric(df.get('Auto-invited followers', 0), errors='coerce').fillna(0).sum())
                total_new = total_organic + total_sponsored + total_auto
                
                # Get latest cumulative count
                total_col = pd.to_numeric(df.get('Total followers', 0), errors='coerce').fillna(0)
                current_total = int(total_col.iloc[-1]) if len(total_col) > 0 else 0
                
                # Monthly growth
                df['_date'] = pd.to_datetime(df.get('Date', ''), errors='coerce')
                monthly_growth = []
                if '_date' in df.columns:
                    df['_month'] = df['_date'].dt.to_period('M')
                    for month, group in df.groupby('_month'):
                        org = int(pd.to_numeric(group.get('Organic followers', 0), errors='coerce').fillna(0).sum())
                        spon = int(pd.to_numeric(group.get('Sponsored followers', 0), errors='coerce').fillna(0).sum())
                        monthly_growth.append({
                            'month': str(month),
                            'organic': org,
                            'sponsored': spon,
                            'net': org + spon,
                        })
                
                customer_data['followers'] = {
                    'current_total': current_total,
                    'new_organic': total_organic,
                    'new_sponsored': total_sponsored,
                    'new_auto_invited': total_auto,
                    'total_new': total_new,
                    'organic_ratio': round(total_organic / max(total_new, 1), 3),
                    'monthly_growth': monthly_growth,
                    'avg_monthly_growth': round(total_new / max(len(monthly_growth), 1), 0),
                }
            
            # Demographics
            for dimension in ['Location', 'Job function', 'Seniority', 'Industry', 'Company size']:
                df_dem = read_xls_file(xl_path, sheet_name=dimension)
                if df_dem is not None and not df_dem.empty:
                    items = []
                    for _, row in df_dem.head(15).iterrows():
                        vals = list(row.values)
                        if len(vals) >= 2:
                            items.append({
                                'label': str(vals[0]),
                                'value': int(float(vals[1])) if vals[1] and str(vals[1]) != 'nan' else 0,
                            })
                    customer_data['demographics'][f'followers_{dimension.lower().replace(" ", "_")}'] = items
        
        # --- VISITORS ---
        if customer in visitor_files:
            xl_path = visitor_files[customer]
            
            df = read_xls_file(xl_path, sheet_name='Visitor metrics')
            if df is not None and not df.empty:
                # Total page views
                total_views_col = pd.to_numeric(df.get('Total page views (total)', 0), errors='coerce').fillna(0)
                total_unique_col = pd.to_numeric(df.get('Total unique visitors (total)', 0), errors='coerce').fillna(0)
                jobs_views_col = pd.to_numeric(df.get('Jobs page views (total)', 0), errors='coerce').fillna(0)
                life_views_col = pd.to_numeric(df.get('Life page views (total)', 0), errors='coerce').fillna(0)
                desktop_col = pd.to_numeric(df.get('Total page views (desktop)', 0), errors='coerce').fillna(0)
                mobile_col = pd.to_numeric(df.get('Total page views (mobile)', 0), errors='coerce').fillna(0)
                
                total_views = int(total_views_col.sum())
                total_unique = int(total_unique_col.sum())
                total_jobs = int(jobs_views_col.sum())
                total_life = int(life_views_col.sum())
                total_desktop = int(desktop_col.sum())
                total_mobile = int(mobile_col.sum())
                
                customer_data['visitors'] = {
                    'total_page_views': total_views,
                    'total_unique_visitors': total_unique,
                    'jobs_page_views': total_jobs,
                    'life_page_views': total_life,
                    'desktop_share': round(total_desktop / max(total_views, 1), 3),
                    'mobile_share': round(total_mobile / max(total_views, 1), 3),
                    'jobs_ratio': round(total_jobs / max(total_views, 1), 3),
                    'life_ratio': round(total_life / max(total_views, 1), 3),
                }
            
            # Visitor demographics
            for dimension in ['Location', 'Job function', 'Seniority', 'Industry', 'Company size']:
                df_dem = read_xls_file(xl_path, sheet_name=dimension)
                if df_dem is not None and not df_dem.empty:
                    items = []
                    for _, row in df_dem.head(15).iterrows():
                        vals = list(row.values)
                        if len(vals) >= 2:
                            items.append({
                                'label': str(vals[0]),
                                'value': int(float(vals[1])) if vals[1] and str(vals[1]) != 'nan' else 0,
                            })
                    customer_data['demographics'][f'visitors_{dimension.lower().replace(" ", "_")}'] = items
        
        # Audience Quality Score
        customer_data['score'] = _calc_audience_score(customer_data)
        results[customer] = customer_data
    
    return results


def _calc_audience_score(data: Dict) -> int:
    """Calculate Audience area score (0-100)."""
    score = 50  # baseline
    
    followers = data.get('followers', {})
    visitors = data.get('visitors', {})
    
    # Growth momentum (0-25)
    organic_ratio = followers.get('organic_ratio', 0)
    score += int(organic_ratio * 25)
    
    # Jobs page interest (0-15) - higher = more recruitment intent
    jobs_ratio = visitors.get('jobs_ratio', 0)
    score += min(int(jobs_ratio * 100), 15)
    
    # Volume bonus (0-10)
    total = followers.get('current_total', 0)
    score += min(int(total / 10000 * 10), 10)
    
    return min(score, 100)


# ============================================================
# AREA 3: PAID MEDIA (Campaign Manager)
# ============================================================

def _safe_float(val: str, default: float = 0.0) -> float:
    """Parse a float from locale-formatted strings like '1,300.00' or '45.67%'."""
    if not val or val.strip() == '':
        return default
    try:
        cleaned = val.strip().replace(',', '').replace('%', '').replace('$', '').replace('kr', '')
        return float(cleaned)
    except (ValueError, TypeError):
        return default


def analyze_paid_media(files: Dict[str, str]) -> Dict[str, Any]:
    """Analyze LinkedIn Campaign Manager data."""
    results = {
        'campaigns': {},
        'companies': {},
        'demographics': {},
        'summary': {},
    }
    
    # --- Campaign Performance ---
    if 'campaign_performance' in files:
        rows = read_utf16_csv(files['campaign_performance'])
        if rows:
            total_spend = 0
            total_impressions = 0
            total_clicks = 0
            total_leads = 0
            total_conversions = 0
            campaigns_by_objective = {}
            monthly_trend = {}
            
            for row in rows:
                spend = _safe_float(row.get('Total Spent', '0'))
                impressions = int(_safe_float(row.get('Impressions', '0')))
                clicks = int(_safe_float(row.get('Clicks', '0')))
                leads = int(_safe_float(row.get('Leads', '0')))
                conversions = int(_safe_float(row.get('Conversions', '0')))
                objective = row.get('Campaign Objective Type', 'Unknown')
                date_str = row.get('Start Date (in UTC)', '')
                
                total_spend += spend
                total_impressions += impressions
                total_clicks += clicks
                total_leads += leads
                total_conversions += conversions
                
                # By objective
                if objective not in campaigns_by_objective:
                    campaigns_by_objective[objective] = {
                        'count': 0, 'spend': 0, 'impressions': 0,
                        'clicks': 0, 'leads': 0, 'conversions': 0,
                    }
                obj = campaigns_by_objective[objective]
                obj['count'] += 1
                obj['spend'] += spend
                obj['impressions'] += impressions
                obj['clicks'] += clicks
                obj['leads'] += leads
                obj['conversions'] += conversions
                
                # Monthly trend
                if date_str:
                    try:
                        dt = datetime.strptime(date_str.strip(), '%m/%d/%Y')
                        month_key = dt.strftime('%Y-%m')
                        if month_key not in monthly_trend:
                            monthly_trend[month_key] = {'spend': 0, 'impressions': 0, 'clicks': 0, 'leads': 0}
                        monthly_trend[month_key]['spend'] += spend
                        monthly_trend[month_key]['impressions'] += impressions
                        monthly_trend[month_key]['clicks'] += clicks
                        monthly_trend[month_key]['leads'] += leads
                    except:
                        pass
            
            # KPIs
            cpm = (total_spend / max(total_impressions, 1)) * 1000
            cpc = total_spend / max(total_clicks, 1)
            ctr = total_clicks / max(total_impressions, 1)
            cpl = total_spend / max(total_leads, 1) if total_leads > 0 else 0
            
            # Add derived KPIs to objectives
            for obj_name, obj_data in campaigns_by_objective.items():
                obj_data['cpm'] = round((obj_data['spend'] / max(obj_data['impressions'], 1)) * 1000, 2)
                obj_data['cpc'] = round(obj_data['spend'] / max(obj_data['clicks'], 1), 2)
                obj_data['ctr'] = round(obj_data['clicks'] / max(obj_data['impressions'], 1), 4)
                if obj_data['leads'] > 0:
                    obj_data['cpl'] = round(obj_data['spend'] / obj_data['leads'], 2)
            
            # Monthly trend as sorted list
            trend_list = [{'month': k, **v} for k, v in sorted(monthly_trend.items())]
            for t in trend_list:
                t['cpm'] = round((t['spend'] / max(t['impressions'], 1)) * 1000, 2)
                t['ctr'] = round(t['clicks'] / max(t['impressions'], 1), 4)
            
            results['summary'] = {
                'total_spend': round(total_spend, 2),
                'total_impressions': total_impressions,
                'total_clicks': total_clicks,
                'total_leads': total_leads,
                'total_conversions': total_conversions,
                'cpm': round(cpm, 2),
                'cpc': round(cpc, 2),
                'ctr': round(ctr, 4),
                'cpl': round(cpl, 2),
                'num_ad_sets': len(rows),
                'date_range': f"{rows[0].get('Start Date (in UTC)', '')} - {rows[-1].get('Start Date (in UTC)', '')}",
            }
            results['campaigns']['by_objective'] = campaigns_by_objective
            results['campaigns']['monthly_trend'] = trend_list
    
    # --- Companies Export (15,000 companies) ---
    if 'companies_export' in files:
        try:
            df = pd.read_csv(files['companies_export'])
            
            # Engagement level distribution
            if 'Engagement Level' in df.columns:
                level_dist = df['Engagement Level'].value_counts().to_dict()
                results['companies']['engagement_distribution'] = {
                    str(k): int(v) for k, v in level_dist.items()
                }
            
            # Top companies by engagement
            for col in ['Organic Engagements', 'Paid Engagements', 'Organic Impressions']:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            
            if 'Organic Engagements' in df.columns:
                top_companies = df.nlargest(20, 'Organic Engagements')[
                    ['Company Name', 'Engagement Level', 'Organic Impressions', 'Organic Engagements',
                     'Paid Impressions', 'Paid Clicks']
                ].to_dict('records')
                results['companies']['top_engaged'] = top_companies
            
            results['companies']['total_companies'] = len(df)
        except Exception as e:
            print(f"Error reading companies export: {e}")
    
    # --- Demographics ---
    if 'demographics' in files:
        rows = read_utf16_csv(files['demographics'])
        if rows:
            demo_data = []
            for row in rows:
                segment = row.get('Company Name Segment', '')
                if segment:
                    demo_data.append({
                        'segment': segment,
                        'impressions': int(float(row.get('Impressions', '0') or '0')),
                        'clicks': int(float(row.get('Clicks', '0') or '0')),
                        'ctr': row.get('Click Through Rate', '0'),
                    })
            results['demographics'] = demo_data[:30]
    
    # Paid Media Score
    summary = results.get('summary', {})
    results['score'] = _calc_paid_score(summary)
    
    return results


def _calc_paid_score(summary: Dict) -> int:
    """Calculate Paid Media area score (0-100)."""
    if not summary:
        return 0
    
    score = 30  # baseline
    
    # CTR score (0-30): 1% = good for LinkedIn
    ctr = summary.get('ctr', 0)
    score += min(int(ctr / 0.01 * 30), 30)
    
    # Lead efficiency (0-20): CPL < 500 kr = good
    cpl = summary.get('cpl', 0)
    if cpl > 0:
        score += max(0, min(int((1 - cpl / 1000) * 20), 20))
    
    # Volume (0-20)
    impressions = summary.get('total_impressions', 0)
    score += min(int(impressions / 1_000_000 * 20), 20)
    
    return min(score, 100)


# ============================================================
# AREA 4: RECRUITMENT
# ============================================================

def analyze_recruitment(files: Dict[str, str]) -> Dict[str, Any]:
    """Analyze LinkedIn Recruiter data."""
    results = {
        'inmail': {},
        'pipeline': {},
        'funnel': {},
        'recruiter_usage': {},
        'score': 0,
    }
    
    # --- InMail Report ---
    if 'inmail_report' in files:
        xl = read_xlsx_file(files['inmail_report'], sheet_name='Overall')
        if xl is not None and not xl.empty:
            overall = {}
            for _, row in xl.iterrows():
                inmail_type = str(row.get('InMail Type', ''))
                if inmail_type == 'Overall':
                    overall = {
                        'sends': int(row.get('Sends', 0)),
                        'responses': int(row.get('Responses', 0)),
                        'response_rate': float(row.get('Response Rate %', 0)),
                        'response_rate_benchmark': float(row.get('Response Rate-Benchmark %', 0)),
                        'accepts': int(row.get('Accepts', 0)),
                        'accept_rate': float(row.get('Accept Rate %', 0)),
                        'accept_rate_benchmark': float(row.get('Accept Rate-Benchmark %', 0)),
                        'time_to_accept': float(row.get('Time to Accept (Hours)', 0)),
                    }
                    # Calculate gap
                    overall['response_gap_pp'] = round(
                        overall['response_rate'] - overall['response_rate_benchmark'], 1
                    )
                    overall['accept_gap_pp'] = round(
                        overall['accept_rate'] - overall['accept_rate_benchmark'], 1
                    )
            results['inmail']['overall'] = overall
        
        # InMail timeline
        xl_timeline = read_xlsx_file(files['inmail_report'], sheet_name='Insights graph')
        if xl_timeline is not None and not xl_timeline.empty:
            timeline = []
            for _, row in xl_timeline.iterrows():
                timeline.append({
                    'date': str(row.get('Date (UTC)', '')),
                    'sends': int(row.get('Sends - Overall', 0) or 0),
                    'responses': int(row.get('Responses - Overall', 0) or 0),
                    'response_rate': float(row.get('Response Rate - Overall %', 0) or 0),
                })
            results['inmail']['timeline'] = timeline
        
        # Top/Bottom recruiters by seat
        xl_seats = read_xlsx_file(files['inmail_report'], sheet_name='Seats')
        if xl_seats is not None and not xl_seats.empty:
            active_seats = xl_seats[xl_seats.get('Seat State', '') == 'ACTIVE'] if 'Seat State' in xl_seats.columns else xl_seats
            
            # Count active
            results['inmail']['total_seats'] = len(xl_seats)
            results['inmail']['active_seats'] = len(active_seats)
    
    # --- Pipeline Report ---
    if 'pipeline_report' in files:
        xl = read_xlsx_file(files['pipeline_report'], sheet_name='Hiring pipeline')
        if xl is not None and not xl.empty:
            stages = []
            for _, row in xl.iterrows():
                stage = {
                    'stage': str(row.get('Hiring stage', '')),
                    'moved_into': int(row.get('Number of candidates moved into stage', 0) or 0),
                    'remained': int(row.get('Number of candidates remained in stage', 0) or 0),
                    'conversion_rate': float(row.get('Conversion rate', 0) or 0),
                    'archived': int(row.get('Number of archived candidates', 0) or 0),
                    'avg_time_days': int(row.get('Average time in stage', 0) or 0),
                }
                stages.append(stage)
            results['pipeline']['stages'] = stages
    
    # --- Funnel Report ---
    if 'funnel_report' in files:
        xl = read_xlsx_file(files['funnel_report'], sheet_name='Hiring Funnel')
        if xl is not None and not xl.empty:
            funnel_stages = []
            for _, row in xl.iterrows():
                funnel_stages.append({
                    'stage': str(row.get('Funnel stage', '')),
                    'candidates': int(row.get('Number of candidates', 0) or 0),
                    'next_stage_conversion': float(row.get('% Next stage conversion rate', 0) or 0),
                    'benchmark_conversion': float(row.get('Technology, Information and Media Benchmark conversion rate', 0) or 0),
                })
            results['funnel']['stages'] = funnel_stages
        
        # Funnel trend
        xl_trend = read_xlsx_file(files['funnel_report'], sheet_name='Candidate Trend')
        if xl_trend is not None and not xl_trend.empty:
            trend = []
            for _, row in xl_trend.iterrows():
                trend.append({
                    'stage': str(row.get('Funnel stage', '')),
                    'month': str(row.get('Month', '')),
                    'candidates': int(row.get('Number of candidates', 0) or 0),
                })
            results['funnel']['trend'] = trend
    
    # --- Recruiter Usage ---
    if 'recruiter_usage' in files:
        xl = read_xlsx_file(files['recruiter_usage'], sheet_name='Usage')
        if xl is not None and not xl.empty:
            usage_timeline = []
            for _, row in xl.iterrows():
                usage_timeline.append({
                    'date': str(row.get('Date (UTC)', '')),
                    'daily_active_users': int(row.get('Total Daily Active Users', 0) or 0),
                    'searches': int(row.get('Total Searches Performed', 0) or 0),
                    'profiles_viewed': int(row.get('Total Profiles Viewed', 0) or 0),
                    'inmails_sent': int(row.get('Total InMails sent', 0) or 0),
                    'inmails_accepted': int(row.get('Total InMails accepted', 0) or 0),
                })
            results['recruiter_usage']['timeline'] = usage_timeline
    
    # Score
    results['score'] = _calc_recruitment_score(results)
    
    return results


def _calc_recruitment_score(data: Dict) -> int:
    """Calculate Recruitment area score (0-100)."""
    score = 20  # baseline
    
    inmail = data.get('inmail', {}).get('overall', {})
    
    # InMail response rate vs benchmark (0-40)
    rate = inmail.get('response_rate', 0)
    benchmark = inmail.get('response_rate_benchmark', 38.8)
    if benchmark > 0:
        ratio = rate / benchmark  # 1.0 = at benchmark
        score += min(int(ratio * 40), 40)
    
    # Pipeline conversion (0-20)
    pipeline = data.get('pipeline', {}).get('stages', [])
    if pipeline:
        first_stage = pipeline[0]
        conv = first_stage.get('conversion_rate', 0)
        score += min(int(conv * 80), 20)  # 25% conv = full marks
    
    # Funnel efficiency (0-20)
    funnel = data.get('funnel', {}).get('stages', [])
    if len(funnel) >= 2:
        top = funnel[0].get('candidates', 1)
        bottom = funnel[-1].get('candidates', 0)
        efficiency = bottom / max(top, 1)
        score += min(int(efficiency * 2000), 20)  # 1% efficiency = full marks
    
    return min(score, 100)


# ============================================================
# AREA 5: COMPETITORS
# ============================================================

def analyze_competitors(files: Dict[str, str]) -> Dict[str, Any]:
    """Analyze competitor analytics data."""
    results = {}
    
    for customer, filepath in files.items():
        df = read_xlsx_file(filepath, sheet_name='COMPETITORS')
        if df is None or df.empty:
            continue
        
        # The actual header is in row 1 (0-indexed), re-read
        df = pd.read_excel(filepath, engine='openpyxl', header=1)
        
        competitors = []
        own_data = None
        
        for _, row in df.iterrows():
            page = str(row.get('Page', ''))
            entry = {
                'name': page,
                'total_followers': int(row.get('Total Followers', 0) or 0),
                'new_followers': int(row.get('New Followers', 0) or 0),
                'total_engagements': int(row.get('Total post engagements', 0) or 0),
                'total_posts': int(row.get('Total posts', 0) or 0),
            }
            entry['engagement_per_post'] = round(
                entry['total_engagements'] / max(entry['total_posts'], 1), 1
            )
            entry['follower_growth_rate'] = round(
                entry['new_followers'] / max(entry['total_followers'] - entry['new_followers'], 1), 4
            )
            competitors.append(entry)
            
            # Identify own page
            if customer.lower().replace(' ab', '').replace(' ', '') in page.lower().replace(' ', ''):
                own_data = entry
        
        # Sort by total engagements (desc)
        competitors.sort(key=lambda x: x['total_engagements'], reverse=True)
        
        # Rank
        for i, c in enumerate(competitors, 1):
            c['rank'] = i
        
        # Share of Voice
        total_eng = sum(c['total_engagements'] for c in competitors)
        total_posts = sum(c['total_posts'] for c in competitors)
        for c in competitors:
            c['sov_engagement'] = round(c['total_engagements'] / max(total_eng, 1), 4)
            c['sov_content'] = round(c['total_posts'] / max(total_posts, 1), 4)
        
        own_rank = 0
        own_sov = 0
        if own_data:
            for c in competitors:
                if c['name'] == own_data['name']:
                    own_rank = c['rank']
                    own_sov = c['sov_engagement']
        
        results[customer] = {
            'leaderboard': competitors,
            'own_rank': own_rank,
            'own_sov_engagement': own_sov,
            'total_competitors': len(competitors),
            'score': _calc_competitor_score(own_rank, own_sov, len(competitors)),
        }
    
    return results


def _calc_competitor_score(rank: int, sov: float, total: int) -> int:
    """Calculate Competitor area score (0-100)."""
    if total == 0:
        return 50
    
    # Rank score (0-50): #1 = 50, last = 0
    rank_score = int((1 - (rank - 1) / max(total - 1, 1)) * 50)
    
    # SoV score (0-50): proportional share = baseline, overperforming = bonus
    fair_share = 1.0 / total
    sov_ratio = sov / fair_share if fair_share > 0 else 0
    sov_score = min(int(sov_ratio * 25), 50)
    
    return min(rank_score + sov_score, 100)


# ============================================================
# AREA 6: TALENT MARKET
# ============================================================

def analyze_talent_market(files: Dict[str, str]) -> Dict[str, Any]:
    """Analyze Talent Insights data."""
    results = {}
    
    if 'talent_insights' in files:
        try:
            raw_data = {}
            with open(files['talent_insights'], 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip().replace('\r', '')
                    if ',' in line:
                        parts = line.split(',', 1)
                        key = parts[0].strip()
                        value = parts[1].strip().strip('"')
                        raw_data[key] = value
            
            results = {
                'pool_size': int(raw_data.get('Professionals', '0')),
                'growth': raw_data.get('Growth', '0'),
                'job_changers': int(raw_data.get('Changed jobs', '0')),
                'engaged_talent': int(raw_data.get('Engaged talent', '0')),
                'hiring_demand': raw_data.get('Hiring demand (low, moderate, high, very high)', 'unknown'),
                'gender_diversity_female': raw_data.get('Gender diversity (female)', '0'),
                'top_location': raw_data.get('Location (city)', ''),
                'top_employers': raw_data.get('Companies employeing (top 10)', ''),
                'untapped_companies': raw_data.get('Untapped Companies (top 10)', ''),
                'top_titles': raw_data.get('Titles (most common top 10)', ''),
                'growing_titles': raw_data.get('Titles (fastest growing top 10)', ''),
                'top_skills': raw_data.get('Skills (most common top 10)', ''),
                'growing_skills': raw_data.get('Skills (fastest growing top 10)', ''),
                'top_industries': raw_data.get('Industy (most common top 10)', ''),
                'top_universities': raw_data.get('Education (top 10 universities)', ''),
                'top_fields': raw_data.get('Fields of study (top 10)', ''),
                'score': 50,  # Baseline - need more data for scoring
            }
            
            # Hiring demand signal
            demand = results['hiring_demand'].lower()
            if demand == 'very high':
                results['demand_signal'] = 'Starkt konkurrensutsatt marknad'
            elif demand == 'high':
                results['demand_signal'] = 'Hög efterfrågan — agera snabbt'
            elif demand == 'moderate':
                results['demand_signal'] = 'Balanserad marknad'
            else:
                results['demand_signal'] = 'Låg efterfrågan — arbetsgivarens marknad'
            
        except Exception as e:
            print(f"Error reading talent insights: {e}")
    
    return results


# ============================================================
# AGGREGATED HEALTH SCORE
# ============================================================

def calculate_health_score(area_scores: Dict[str, int], weights: Dict[str, float] = None) -> Dict[str, Any]:
    """Calculate the aggregated Insiders Health Score."""
    if weights is None:
        weights = {
            'content': 0.20,
            'audience': 0.15,
            'paid_media': 0.20,
            'recruitment': 0.30,
            'competitors': 0.15,
        }
    
    weighted_sum = 0
    total_weight = 0
    
    breakdown = {}
    for area, score in area_scores.items():
        weight = weights.get(area, 0)
        weighted_sum += score * weight
        total_weight += weight
        breakdown[area] = {
            'score': score,
            'weight': weight,
            'contribution': round(score * weight, 1),
        }
    
    overall = round(weighted_sum / max(total_weight, 1), 0)
    
    # Generate top insights
    insights = []
    sorted_areas = sorted(breakdown.items(), key=lambda x: x[1]['score'])
    
    # Weakest area
    if sorted_areas:
        weakest = sorted_areas[0]
        insights.append({
            'type': 'critical' if weakest[1]['score'] < 40 else 'warning',
            'area': weakest[0],
            'message': f"{weakest[0].title()} har lägst score ({weakest[1]['score']}/100) — prioritera förbättringar här.",
        })
    
    # Strongest area
    if len(sorted_areas) > 1:
        strongest = sorted_areas[-1]
        insights.append({
            'type': 'positive',
            'area': strongest[0],
            'message': f"{strongest[0].title()} presterar bäst ({strongest[1]['score']}/100) — fortsätt investera.",
        })
    
    return {
        'overall_score': int(overall),
        'breakdown': breakdown,
        'insights': insights,
    }


# ============================================================
# MAIN ORCHESTRATOR
# ============================================================

def analyze_all(data_dir: str) -> Dict[str, Any]:
    """
    Main entry point: scan a directory of LinkedIn exports and produce
    complete analysis across all 6 areas + aggregated health score.
    """
    # Discover and classify files
    file_map = {}
    for filename in os.listdir(data_dir):
        filepath = os.path.join(data_dir, filename)
        if os.path.isfile(filepath):
            ftype = detect_file_type(filename)
            customer = extract_customer_name(filename)
            
            if ftype not in file_map:
                file_map[ftype] = {}
            file_map[ftype][customer] = filepath
    
    print(f"📁 Found {sum(len(v) for v in file_map.values())} files across {len(file_map)} categories")
    for ftype, files in file_map.items():
        print(f"   {ftype}: {list(files.keys())}")
    
    # Run area analyses
    print("\n🔵 Analyzing Content...")
    content = analyze_content(file_map.get('content', {}))
    
    print("🟢 Analyzing Audience...")
    audience = analyze_audience(
        file_map.get('followers', {}),
        file_map.get('visitors', {})
    )
    
    print("🟡 Analyzing Paid Media...")
    # Flatten campaign manager files
    paid_files = {}
    for ftype in ['campaign_performance', 'creative_performance', 'campaign_placement',
                   'creative_placement', 'lan_campaign_performance', 'lan_creative_performance',
                   'demographics', 'companies_export', 'conversion_performance',
                   'creative_conversion', 'conversation_ads']:
        if ftype in file_map:
            # Just get the first file path
            paid_files[ftype] = list(file_map[ftype].values())[0]
    paid_media = analyze_paid_media(paid_files)
    
    print("🔴 Analyzing Recruitment...")
    recruit_files = {}
    for ftype in ['inmail_report', 'pipeline_report', 'funnel_report', 'recruiter_usage', 'recruiter_custom']:
        if ftype in file_map:
            recruit_files[ftype] = list(file_map[ftype].values())[0]
    recruitment = analyze_recruitment(recruit_files)
    
    print("🟣 Analyzing Competitors...")
    competitors = analyze_competitors(file_map.get('competitors', {}))
    
    print("🟠 Analyzing Talent Market...")
    talent_files = {}
    if 'talent_insights' in file_map:
        talent_files['talent_insights'] = list(file_map['talent_insights'].values())[0]
    talent_market = analyze_talent_market(talent_files)
    
    # Aggregate scores
    print("\n📊 Calculating Health Score...")
    
    # Get best available scores per area
    content_score = max((v.get('score', 0) for v in content.values()), default=0)
    audience_score = max((v.get('score', 0) for v in audience.values()), default=0)
    paid_score = paid_media.get('score', 0)
    recruit_score = recruitment.get('score', 0)
    competitor_score = max(
        (v.get('score', 0) for v in competitors.values()), default=0
    )
    
    health = calculate_health_score({
        'content': content_score,
        'audience': audience_score,
        'paid_media': paid_score,
        'recruitment': recruit_score,
        'competitors': competitor_score,
    })
    
    result = {
        'generated_at': datetime.now().isoformat(),
        'data_directory': data_dir,
        'files_processed': sum(len(v) for v in file_map.values()),
        'areas': {
            'content': content,
            'audience': audience,
            'paid_media': paid_media,
            'recruitment': recruitment,
            'competitors': competitors,
            'talent_market': talent_market,
        },
        'health_score': health,
    }
    
    # Sanitize NaN/Inf values for JSON
    result = _sanitize_for_json(result)
    
    print(f"\n✅ Analysis complete!")
    print(f"   Health Score: {health['overall_score']}/100")
    for area, data in health['breakdown'].items():
        print(f"   {area}: {data['score']}/100 (weight: {data['weight']})")
    
    return result


def _sanitize_for_json(obj):
    """Recursively replace NaN/Inf floats with 0 for JSON compliance."""
    import math
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0
        return obj
    return obj


# ============================================================
# CLI
# ============================================================

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        data_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'Insiderskunder')
    else:
        data_dir = sys.argv[1]
    
    if not os.path.exists(data_dir):
        print(f"❌ Directory not found: {data_dir}")
        sys.exit(1)
    
    result = analyze_all(data_dir)
    
    # Save output
    output_path = os.path.join(os.path.dirname(__file__), '..', 'analysis_output.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False, default=str)
    
    print(f"\n💾 Full analysis saved to: {output_path}")
