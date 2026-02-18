import { SignUp } from "@clerk/clerk-react";

const SignUpPage: React.FC = () => {
  return (
    <div className="relative flex items-center justify-center h-screen w-screen bg-gray-100 overflow-hidden p-5">
      <SignUp
        routing="hash"
        signInUrl="/login"
        waitlistUrl="/waitlist"
        appearance={{
          layout: {
            socialButtonsPlacement: "bottom",
          },
          variables: {
            borderRadius: "0px",
          },
          elements: {
            card: {
              width: "100%",
              border: "none",
              borderRadius: "0px",
            },
            formButtonPrimary:
              "bg-primary text-white text-primary-foreground hover:bg-primary/80",
            button: "bg-primary text-white text-primary-foreground hover:bg-primary/80",
            socialButtonsBlockButton:
              "bg-primary text-white text-primary-foreground hover:bg-primary/80",
            // input: {
          },
        }}
      />
    </div>
  );
};

export default SignUpPage;
