"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldQuestion, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import FormInput from "../clients/components/FormInput";
import FormSelect from "../clients/components/FormSelect";
import PageHeader from "@/components/PageHeader";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

export default function RiskProfilingPage() {
  const [role, setRole] = useState(null);
  const [clients, setClients] = useState([]);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [answers, setAnswers] = useState({});
  const [remarks, setRemarks] = useState("");
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const isAdmin = role === "admin";
  const totalScore = useMemo(() => Object.values(answers).reduce((sum, answer) => sum + (Number(answer.score) || 0), 0), [answers]);
  const activeQuestion = questions[activeQuestionIndex];
  const answeredCount = Object.keys(answers).length;

  async function loadData(clientId = selectedClient) {
    const [{ data: userData }, questionsRes, assessmentsRes] = await Promise.all([
      supabase.auth.getUser(),
      authFetch("/api/risk-profiling/questions"),
      authFetch(clientId ? `/api/risk-profiling?client_id=${clientId}` : "/api/risk-profiling"),
    ]);

    if (userData?.user?.id) {
      const [{ data: profile }, { data: clientRows }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle(),
        supabase.from("clients").select("id, full_name, risk_category").order("full_name", { ascending: true }),
      ]);
      setRole(profile?.role || null);
      setClients(clientRows || []);
    }

    if (questionsRes.ok) {
      const data = await questionsRes.json();
      setQuestionnaire(data.questionnaire);
      setQuestions(data.questions || []);
    }

    if (assessmentsRes.ok) {
      const data = await assessmentsRes.json();
      setAssessments(data.assessments || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    const initialClientId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("client_id") : "";
    if (initialClientId) setSelectedClient(initialClientId);
    loadData(initialClientId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateAnswer(question, option) {
    setAnswers((current) => ({
      ...current,
      [question.id]: {
        question_id: question.id,
        answer_label: option.label,
        score: option.score,
      },
    }));
  }

  async function submitAssessment(event) {
    event.preventDefault();
    if (!selectedClient) {
      toast.error("Select a client");
      return;
    }
    if (Object.keys(answers).length !== questions.length) {
      toast.error("Answer all risk questions");
      return;
    }

    const response = await authFetch("/api/risk-profiling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: selectedClient,
        questionnaire_id: questionnaire?.id,
        answers: Object.values(answers),
        remarks,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || "Risk assessment failed");
      return;
    }

    toast.success("Risk profile saved");
    setAnswers({});
    setRemarks("");
    setActiveQuestionIndex(0);
    loadData(selectedClient);
  }

  async function approveAssessment(id) {
    const response = await authFetch(`/api/risk-profiling/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || "Approval failed");
      return;
    }
    toast.success("Risk profile approved");
    loadData(selectedClient);
  }

  if (loading) return <div className="p-6 text-gray-500">Loading risk profiling...</div>;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Risk workspace"
        title="Risk Profiling"
        description="Capture questionnaire answers, score clients, and keep risk history."
        icon={ShieldQuestion}
      />

      <div className="grid xl:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={submitAssessment} className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <ShieldQuestion className="text-violet-700" />
            <h2 className="text-xl font-semibold text-gray-800">{questionnaire?.title || "Risk Questionnaire"}</h2>
          </div>

          <FormSelect
            label="Client"
            name="client_id"
            placeholder="Select client"
            value={selectedClient}
            onValueChange={(value) => {
              setSelectedClient(value);
              loadData(value);
            }}
            options={clients.map((client) => ({ value: client.id, label: client.full_name }))}
          />

          <div className="flex flex-wrap gap-2">
            {questions.map((question, index) => (
              <button
                key={question.id}
                type="button"
                onClick={() => setActiveQuestionIndex(index)}
                className={`h-9 min-w-9 rounded-full border text-sm font-semibold ${
                  index === activeQuestionIndex
                    ? "border-blue-600 bg-blue-600 text-white"
                    : answers[question.id]
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-gray-200 bg-white text-gray-500"
                }`}
                title={`Question ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          {activeQuestion ? (
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-blue-700">
                  Question {activeQuestionIndex + 1} of {questions.length}
                </p>
                <p className="text-xs text-gray-500">{answeredCount}/{questions.length} answered</p>
              </div>
              <p className="text-lg font-semibold text-gray-900">{activeQuestion.question_text}</p>
              <div className="mt-4 space-y-2">
                {(activeQuestion.option_set || []).map((option) => {
                  const selected = answers[activeQuestion.id]?.answer_label === option.label;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => updateAnswer(activeQuestion, option)}
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-900"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="ml-2 text-xs text-gray-400">Score {option.score}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}
                  disabled={activeQuestionIndex === 0}
                  className="rounded-lg border px-4 py-2 text-sm text-gray-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setActiveQuestionIndex((index) => Math.min(questions.length - 1, index + 1))}
                  disabled={activeQuestionIndex === questions.length - 1}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-white p-5 text-sm text-gray-500">
              No risk questions configured.
            </div>
          )}

          <FormInput label="Remarks" name="remarks" value={remarks} onValueChange={setRemarks} multiline />

          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Current score: <strong>{totalScore}</strong></div>
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-white">Save Risk Profile</button>
        </form>

        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Assessment History</h2>
          <div className="space-y-3">
            {assessments.map((assessment) => (
              <div key={assessment.id} className="rounded-lg border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{assessment.client?.full_name || "Client"}</p>
                    <p className="text-sm text-gray-500">{formatDateDDMonYYYY(assessment.assessment_date, "-")} / Score {assessment.total_score}</p>
                  </div>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-700">{assessment.risk_category}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">Status: {assessment.status}</p>
                {assessment.remarks && <p className="mt-1 text-sm text-gray-500">{assessment.remarks}</p>}
                {isAdmin && assessment.status !== "Approved" && (
                  <button onClick={() => approveAssessment(assessment.id)} className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-green-700">
                    <CheckCircle2 size={16} /> Approve
                  </button>
                )}
              </div>
            ))}
            {assessments.length === 0 && <p className="text-sm text-gray-500">No risk assessments yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
