import type { Metadata } from "next";
import FieldTest from "@/components/FieldTest";
import { fieldTestAlert, fieldTestQuestions } from "@/lib/field-test";

export const metadata: Metadata = { title: "Agam — field test (comprehension)" };

export default function Page() {
  const { facts, alert } = fieldTestAlert();
  return <FieldTest voice={alert.voice_bn} sms={alert.sms_bn} questions={fieldTestQuestions(facts.eta)} />;
}
