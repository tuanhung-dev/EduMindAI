
import { useEffect, useState } from "react";
import { getSubjects } from "../services/subjectService";

type Subject = Awaited<
  ReturnType<typeof getSubjects>
>[number];

export function useSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data = await getSubjects();

        if (active) {
          setSubjects(data);
        }
      } catch {
        if (active) {
          setError("Không thể tải dữ liệu từ Backend.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  function refresh() {
    setReloadKey((value) => value + 1);
  }

  return { subjects, loading, error, refresh };
}
