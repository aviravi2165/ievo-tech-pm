import { useEffect, useRef, useState, useCallback } from 'react';
import { projectApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from './toastStore';

// Drives the Analytics tab's "+ Add Insight" catalog — the fixed set of
// widgets (see insightsService.js's CATALOG) a project can turn on. Loads
// once when the tab is actually opened (same lazy-cache pattern as
// useProjectAnalytics), and re-fetches computed data after add/remove so
// the newly (de)selected widget appears/disappears without a full page
// reload.
export function useProjectInsights(projectId, active) {
  const [catalog, setCatalog] = useState([]);
  const [added, setAdded] = useState([]);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogRes, addedRes, dataRes] = await Promise.all([
        projectApi.getInsightCatalog(),
        projectApi.getInsights(projectId),
        projectApi.getInsightsData(projectId),
      ]);
      setCatalog(catalogRes || []);
      setAdded(addedRes || []);
      setData(dataRes || {});
      loadedRef.current = true;
    } catch (err) {
      // Previously swallowed silently and reset everything to empty —
      // which, combined with the "not loaded yet → show all defaults"
      // fallback in ProjectAnalytics.js, meant a failed load looked
      // IDENTICAL to a successful one showing only defaults: nothing ever
      // looked broken, but every add/remove kept silently doing nothing.
      // Surfacing the real error (likely "table doesn't exist yet" if the
      // pm_project_insights migration hasn't been applied) is what makes
      // that failure visible instead of indistinguishable from normal.
      showToast(apiErrorMessage(err, 'Failed to load Analytics insights.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!active || loadedRef.current || !projectId) return;
    load();
  }, [active, projectId, load]);

  const addInsight = async (insightType) => {
    setMutating(true);
    try {
      await projectApi.addInsight(projectId, insightType);
      await load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Failed to add this insight.'));
    } finally {
      setMutating(false);
    }
  };

  const removeInsight = async (insightType) => {
    setMutating(true);
    try {
      await projectApi.removeInsight(projectId, insightType);
      await load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Failed to remove this insight.'));
    } finally {
      setMutating(false);
    }
  };

  const addedKeys = new Set(added.map(a => a.insightType));
  const available = catalog.filter(c => !addedKeys.has(c.key));

  return { catalog, added, available, data, loading, mutating, addInsight, removeInsight };
}
